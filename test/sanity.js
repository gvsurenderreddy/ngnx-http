'use strict'

let test = require('tape')
let request = require('request')
let fs = require('fs')

require('ngn')
require('../')

test('Namespace', function (t) {
  t.ok(NGNX !== undefined, 'NGNX is defined globally.')
  t.ok(NGNX.http !== undefined, 'NGNX.http is defined globally.')
  t.ok(NGNX.http.Server !== undefined, 'NGNX.http.Server is defined.')
  t.end()
})

test('Basic Web Serving', function (t) {
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

test('CORS Support', function (t) {
  let server = new NGNX.http.Server({
    autoStart: false,
    ip: '127.0.0.1',
    poweredby: 'test',
    port: 0,
    cors: true,
    credentials: true,
    allowedMethods: ['POST'],
    allowedHeaders: ['X-REQUESTED-WITH'],
    exposedHeaders: ['X-TEST'],
    maxAge: 100000
  })

  server.createRoutes('./test/files/routes')

  server.on('start', function () {
    request({
      method: 'OPTIONS',
      url: 'http://localhost:' + server.port + '/ping',
      headers: {
        origin: 'request.com',
        'access-control-request-headers': 'requestedHeader1,requestedHeader2'
      }
    }, function (err, r, bod) {
      if (err) {
        t.fail(err)
      }
      t.ok(r.statusCode === 204, 'OPTIONS request successfully responds with CORS data.')
      t.ok(r.headers['access-control-allow-methods'] === 'POST', 'Proper Access-Control-Allow-Methods header recognized.')
      t.ok(r.headers['access-control-allow-headers'] === 'X-REQUESTED-WITH', 'Proper Access-Control-Allow-Headers header recognized.')
      t.ok(r.headers['access-control-expose-headers'] === 'X-TEST', 'Proper Access-Control-Expose-Headers header recognized.')
      t.ok(r.headers['access-control-allow-credentials'] === 'true', 'Proper Access-Control-Allow-Credentials header recognized.')
      t.ok(r.headers['access-control-max-age'] === '100000', 'Proper Access-Control-Max-Age header recognized.')
      server.stop()
    })
  })

  server.on('stop', function () {
    t.end()
  })

  server.start()
})

test('Automatic Route Refresh', function (t) {
  let server = new NGNX.http.Server({
    autoStart: false,
    poweredby: 'test',
    port: 0
  })

  server.createRoutes('./test/files/routes')
  server.createRoutes('./test/files/moreroutes')

  server.on('start', function () {
    request.get('http://localhost:' + server.port + '/zing', function (err, r, bod) {
      if (err) {
        console.error(err)
      }
      t.ok(r.statusCode === 200, 'Initial request succeeded.')
      t.comment('Refresh Routes on Removal')

      request.get('http://localhost:' + server.port + '/zing', function (err2, r2, bod2) {
        if (err2) {
          console.error(err2)
        }
        t.ok(r2.statusCode === 200, 'Initial request succeeded.')
        fs.rename('./test/files/moreroutes.js', './test/files/moreroutes.tmp.js', function (fserr) {
          if (fserr) {
            throw fserr
          }
          let wait = 5
          setTimeout(function () {
            request.get('http://localhost:' + server.port + '/zing', function (err3, r3, bod3) {
              if (err3) {
                console.error(err3)
              }
              t.ok(r3.statusCode === 404, 'Next request returned 404 (expected for removed route).')
              if (r3.statusCode !== 404) {
                t.comment('Request returned ' + r3.statusCode.toString())
              }
              t.comment('Refresh Routes on Recreation.')
              fs.rename('./test/files/moreroutes.tmp.js', './test/files/moreroutes.js', function (fserr2) {
                setTimeout(function () {
                  request.get('http://localhost:' + server.port + '/zing', function (err4, r4, bod4) {
                    if (err4) {
                      console.error(err4)
                    }
                    t.ok(r4.statusCode === 200, 'Next request returned 200 (route recreated).')
                    if (r4.statusCode !== 200) {
                      t.comment('Request returned ' + r4.statusCode.toString())
                    }
                    server.stop()
                  })
                }, wait * 1000)
              })
            })
          }, wait * 1000)
        })
      })
    })
  })

  server.on('stop', function () {
    t.end()
  })

  server.start()
})
