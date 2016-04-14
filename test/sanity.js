'use strict'

var test = require('tape')

test('NGNX.http Namespace', function (t) {
  require('ngn')
  require('../')
  t.ok(NGNX !== undefined, 'NGNX is defined globally.')
  t.ok(NGNX.http !== undefined, 'NGNX.http is defined globally.')
  t.ok(NGNX.http.Server !== undefined, 'NGNX.http.Server is defined.')
  t.end()
})
