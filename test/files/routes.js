'use strict'

module.exports = function (app) {
  app.get('/ping', function (req, res) {
    res.sendStatus(200)
  })
}
