var path = require('path');
var fs = require('fs');
var finder = require('fs-finder');
var EOL = require('os').EOL;

var through = require('through2');
var gutil = require('gulp-util');
var glob = require('glob');

module.exports = function(options) {
  options = options || {};
  var startReg = /\/\/-\s*build:(\w+)(?:\(([^\)]+?)\))?\s+(\/?([^\s]+?))?\s*$/gim;
  var endReg = /\/\/-\s*endbuild\s*$/gim;
  var jsReg = /script.+src\s*=\s*['"]([^"']+)['"]/gim;
  var cssReg = /link.+href\s*=\s*['"]([^"']+)['"]/gim;
  var startCondReg = /<!--\[[^\]]+\]>/gim;
  var endCondReg = /<!\[endif\]-->/gim;
  var patterns = [
    /img.+src\s*=\s*['"]([^"']+)['"]/gim,
    /video.+src\s*=\s*['"]([^"']+)['"]/gim,
    /video.+poster\s*=\s*['"]([^"']+)['"]/gim
  ];
  var basePath, mainPath, mainName, alternatePath;

  function createFile(name, content) {
    var filePath = path.join(path.relative(basePath, mainPath), name)
      var isStatic = name.split('.').pop() === 'js' || name.split('.').pop() === 'css'

      if (options.outputRelativePath && isStatic)
        filePath = options.outputRelativePath + name;

    return new gutil.File({
      path: filePath,
      contents: new Buffer(content)
    })
  }

  function getBlockType(content) {
    return jsReg.test(content) ? 'js' : 'css';
  }

  function getFiles(content, reg) {
    var paths = [];
    var files = [];

    content
      .replace(startCondReg, '')
      .replace(endCondReg, '')
      .replace(/<!--(?:(?:.|\r|\n)*?)-->/gim, '')
      .replace(reg, function (a,b) {
        var filePath = path.resolve(path.join(alternatePath || options.path || mainPath, b));

        if (options.assetsDir)
          filePath = path.resolve(path.join(options.assetsDir, path.relative(basePath, filePath)));

        paths.push(filePath);
      });

    for (var i = 0, l = paths.length; i < l; ++i) {
      var filepaths = glob.sync(paths[i]);
      if(filepaths[0] === undefined) {
        throw new gutil.PluginError('gulp-jade-usemin', 'Path ' + paths[i] + ' not found!');
      }
      filepaths.forEach(function (filepath) {
        files.push(new gutil.File({
          path: filepath,
          contents: fs.readFileSync(filepath)
        }));
      });
    }

    return files;
  }

  function concat(files, name) {
    var buffer = [];

    files.forEach(function(file) {
      buffer.push(String(file.contents));
    });

    return createFile(name, buffer.join(EOL));
  }

  function processTask(index, tasks, name, files, callback) {
    var newFiles = [];

    if (tasks[index] == 'concat') {
      newFiles = [concat(files, name)];
    }
    else {
      var stream = tasks[index];

      function write(file) {
        newFiles.push(file);
      }

      stream.on('data', write);
      files.forEach(function(file) {
        stream.write(file);
      });
      stream.removeListener('data', write);
    }

    if (tasks[++index])
      processTask(index, tasks, name, newFiles, callback);
    else
      newFiles.forEach(callback);
  }

  function process(name, files, pipelineId, callback) {
    var tasks = options[pipelineId] || [];
    if (tasks.indexOf('concat') == -1)
      tasks.unshift('concat');

    processTask(0, tasks, name, files, callback);
  }

  function processJade(content, push, callback) {
    var jade = [];
    var sections = content.split(endReg);

    for (var i = 0, l = sections.length; i < l; ++i) {
      if (sections[i].match(startReg)) {
        var section = sections[i].split(startReg);
        alternatePath = section[2];

        jade.push(section[0]);

        var startCondLine = section[5].match(startCondReg);
        var endCondLine = section[5].match(endCondReg);
        if (startCondLine && endCondLine)
          jade.push(startCondLine[0]);

        if (section[1] !== 'remove') {
          if (getBlockType(section[5]) == 'js') {
            process(section[4], getFiles(section[5], jsReg), section[1], function(name, file) {
              push(file);
              name = options.outputRelativePath ? path.join(options.outputRelativePath, name) : name;
              if (path.extname(file.path) == '.js')
                jade.push('script(src="' + name.replace(path.basename(name), path.basename(file.path)) + '")');
            }.bind(this, section[3]));
          } else {
            process(section[4], getFiles(section[5], cssReg), section[1], function(name, file) {
              push(file);
              name = options.outputRelativePath ? path.join(options.outputRelativePath, name) : name;
              if (path.extname(file.path) == '.css')
                jade.push('link(rel="stylesheet", href="' + name.replace(path.basename(name), path.basename(file.path)) + '")');
            }.bind(this, section[3]));
          }
        }

        if (startCondLine && endCondLine) {
          jade.push(endCondLine[0]);
        }
      } else {
        patterns.forEach(function(pattern){
          sections[i].replace(pattern, function(match, src){
            var masked = src.replace(path.extname(src), '.*' + path.extname(src));
            if(options.assetsDir){
              var file = finder.from(options.assetsDir).findFirst().findFiles(masked);
              if(file) {
                var revved = file.replace(options.assetsDir, options.outputRelativePath ? options.outputRelativePath : '');
                sections[i] = sections[i].replace(src, revved);
              }
            }
          });
        });
        sections[i] = sections[i].replace(/(append|prepend) scripts/gi, 'block scripts');
        sections[i] = sections[i].replace(/(append|prepend) stylesheets/gi, 'block stylesheets');
        jade.push(sections[i]);
      }
    }
    process(mainName, [createFile(mainName, jade.join(''))], 'jade', function(file) {
      push(file);
      callback();
    });
  }

  return through.obj(function(file, enc, callback) {
    if (file.isNull()) {
      this.push(file); // Do nothing if no contents
      callback();
    }
    else if (file.isStream()) {
      this.emit('error', new gutil.PluginError('gulp-jade-usemin', 'Streams are not supported!'));
      callback();
    }
    else {
      basePath = file.base;
      mainPath = path.dirname(file.path);
      mainName = path.basename(file.path);

      processJade(String(file.contents), this.push.bind(this), callback);
    }
  });
};
