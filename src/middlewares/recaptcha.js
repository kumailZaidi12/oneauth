const config = require('../../config');
const axios = require('axios');

module.exports = async (req, res, next) => {
  if (req.method === 'POST') {
    const captchaResponse = req.body['g-recaptcha-response'];
    const resp = await axios({
      method: 'POST',
      url: 'https://www.google.com/recaptcha/api/siteverify',
      params: {
        response: captchaResponse,
        secret: config.SECRETS.RECAPTCHA.SECRET
      }
    })

    if (!resp.data.success) {
      return res.sendStatus(403);
    }
  }

  next()
}