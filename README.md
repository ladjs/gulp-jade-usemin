# gulp-jade-usemin
> Replaces references to non-optimized scripts or stylesheets into a set of Jade files (or any templates/views).

This task is designed for gulp 3.
> Attention: v0.3.0 options does not compatible with v0.2.0.

## Usage

First, install `gulp-jade-usemin` as a development dependency:

```shell
npm install --save-dev gulp-jade-usemin
```

Then, add it to your `gulpfile.js`:

```javascript
var usemin = require('gulp-jade-usemin');
var uglify = require('gulp-uglify');
var minifyHtml = require('gulp-minify-html');
var minifyCss = require('gulp-minify-css');
var rev = require('gulp-rev');

gulp.task('usemin', function() {
  gulp.src('./*.jade')
    .pipe(usemin({
      css: [minifyCss(), 'concat'],
      html: [minifyHtml({empty: true})],
      js: [uglify(), rev()]
    }))
    .pipe(gulp.dest('build/'));
});
```


## Changelog

#####0.0.1
- initial release
