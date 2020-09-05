/**
 * Created by hereisnaman on 01/07/20.
 */
const router = require('express').Router();
const passport = require('../../passport/passporthandler');

const config = require('../../../config');

router.get(
  '/',
  passport.authorize('discord', {
    scope: config.DISCORD_LOGIN_SCOPES,
  }),
);

router.get(
  '/callback',
  passport.authorize('discord', {
    failureRedirect: '/login',
  }),
  function (req, res) {
    const redirect = req.session.returnTo || '/users/me';
    req.session.returnTo = undefined;

    res.redirect(redirect);
  },
);

module.exports = router;
