/**
 * Created by championswimmer on 08/03/17.
 */
const router = require('express').Router();
const passport = require('../../passport/passporthandler');
const recaptcha = require('../../middlewares/recaptcha');

router.post('/', recaptcha, passport.authenticate([
    'local',
    // 'lms' // we have deprecated LMS logins now
], {
    failureRedirect: '/login',
    successReturnToOrRedirect: '/users/me',
    failureFlash: true
}));


module.exports = router;
