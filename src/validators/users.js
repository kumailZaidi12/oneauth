const Joi = require('joi')
const {validateNumber, parseNumberEntireString} = require("../utils/mobile_validator");
const {validateUsername} = require("../utils/username_validator");

const userSchema = Joi.object().keys({
    firstname: Joi.string().min(3).required(),
    lastname: Joi.string().min(3).required(),
    email: Joi.string().email().required().lowercase(),
    mobile_number: Joi.string().custom((value, helpers) => {
        if (!(validateNumber(parseNumberEntireString(value)))) {
            return helpers.message('INVALID_MOBILE_NUMBER')
        } else {
            return value
        }
    }),
    username: Joi.string().lowercase().custom((value, helpers) => {
        const error = validateUsername(value)
        if (error) {
            return helpers.message(error)
        } else {
            return value
        }
    }),
    password: Joi.string().min(8).required(),
});


const userBulkInsertSchema = Joi.array().items(userSchema)

const validateBulkUserInsert = async (users) => {
    try {
        const {value, error} = await userBulkInsertSchema.validate(users,
            {
                abortEarly: false
            })
        if (error) {
            throw error
        }
        return value
    } catch (e) {
        throw e
    }
}

module.exports = {
    validateBulkUserInsert
}
