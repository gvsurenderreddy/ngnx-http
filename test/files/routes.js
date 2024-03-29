'use strict'

module.exports = function (app) {
  let subtest = require('./subinclude')(app)

  app.get('/subtest', subtest.test)

  app.get('/ping', function (req, res) {
    res.sendStatus(200)
  })
  app.get('/ping2', function (req, res) {
    res.sendStatus(501)
  })
  app.get('/echo/:text', function test (req, res) {
    res.status(200).send(req.params.text)
  })
}
