'use strict'

let test = require('tape')
let request = require('request')

require('ngn')
require('../')

test('Namespace', function (t) {
  t.ok(NGNX !== undefined, 'NGNX is defined globally.')
  t.ok(NGNX.http !== undefined, 'NGNX.http is defined globally.')
  t.ok(NGNX.http.Server !== undefined, 'NGNX.http.Server is defined.')
  t.end()
})

test('Functionality', function (t) {
  t.ok(typeof NGNX.http.Server === 'function', 'NGNX.http.Server is a recognized class.')

  let server = new NGNX.http.Server({
    autoStart: false,
    poweredby: 'test',
    port: 0
  })

  server.createRoutes('./test/files/routes')

  server.on('start', function () {
    t.ok(server.running, 'Server was started & is running.')
    t.ok(server.port !== 0, 'Automatically chose a port.')
    request.get('http://localhost:' + server.port + '/ping', function (err, r, bod) {
      if (err) {
        console.error(err)
      }
      t.ok(r.statusCode === 200, 'Ping successful.')
      server.stop()
    })
  })

  server.on('stop', function () {
    t.end()
  })

  server.start()
})

test('CORS', function (t) {
  let server = new NGNX.http.Server({
    autoStart: false,
    poweredby: 'test',
    port: 0,
    cors: true,
    allowedMethods: ['POST']
  })

  server.createRoutes('./test/files/routes')

  server.on('start', function () {
    request.get('http://localhost:' + server.port + '/ping', function (err, r, bod) {
      if (err) {
        console.error(err)
      }
      t.ok(r.statusCode === 200, 'Ping successful.')
      server.stop()
    })
  })

  server.on('stop', function () {
    t.end()
  })

  server.start()
})
