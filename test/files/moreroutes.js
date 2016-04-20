'use strict'

module.exports = function (app) {
  app.get('/zing', function (req, res) {
    res.sendStatus(200)
  })
}
