'use strict'

let sub = require('./subsubinclude')

module.exports = function (app) {
  return {
    test: sub
  }
}
