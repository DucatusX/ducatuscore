# Ducatuscore Build

**A helper to add tasks to gulp.**

## Getting started

Install with:

```sh
npm install ducatus-build
```

And use and require in your gulp file:

```javascript
var gulp = require('gulp');
var ducatuscoreTasks = require('@ducatuscore/build');

ducatuscoreTasks('submodule');
gulp.task('default', ['lint', 'test', 'browser', 'coverage']);
```

### Notes

- There's no default task to allow for each submodule to set up their own configuration
- If the module is node-only, avoid adding the browser tasks with:

```javascript
var ducatuscoreTasks = require('ducatuscore-build');
ducatuscoreTasks('submodule', { skipBrowsers: true });
```
