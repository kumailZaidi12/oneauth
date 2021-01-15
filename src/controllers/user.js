const { User, UserLocal, Demographic, College, Branch, Address, WhitelistDomains} = require("../db/models").models;
const { db }= require('../db/models')
const sequelize = require('sequelize');
const Bluebird = require('bluebird');
const Raven = require('raven');
const passutils = require("../utils/password");

const { validateUsername } = require('../utils/username_validator')
const { eventUserCreated, eventUserUpdated } = require('./event/users')

function findAllUsers() {
  return User.findAll({})
}

function findUserById(id, includes) {
    return User.findOne({
        where: { id },
        include: includes
    });
}

function findUserByParams(params) {
    if (params.email) {
        params.email = {
            $iLike: params.email
        }
    }
    return User.findOne({where: params})
}

async function createUserLocal(userParams, pass, includes) {
    const email = userParams.email

    const isWhitelisted = await WhitelistDomains.count({
        where: {
            domain: {
                $iLike: email.split('@')[1]
            }
        }
    })

    if (!isWhitelisted) {
        throw new Error('Email domain not whitelisted')
    }
    const errorMessage = validateUsername(userParams.username) 
    if (errorMessage) throw new Error(errorMessage)
    let userLocal
    try {
        userLocal = await UserLocal.create({user: userParams, password: pass}, {include: includes})
    } catch (err) {
        Raven.captureException(err)
        throw new Error('Unsuccessful registration. Please try again.')
    }
    eventUserCreated(userLocal.user.id).catch(Raven.captureException.bind(Raven))
    return userLocal
}

async function createUserWithoutPassword(userParams) {
    const email = userParams.email

    const isWhitelisted = await WhitelistDomains.count({
        where: {
            domain: {
                $iLike: email.split('@')[1]
            }
        }
    })

    if (!isWhitelisted) {
        throw new Error('Email domain not whitelisted')
    }

    return User.create(userParams, {
        include: [{
            association: User.Demographic
        }]
    })
}

async function createUser(user) {
    const userObj = await User.create(user)
    eventUserCreated(userObj.id).catch(Raven.captureException.bind(Raven))
    return userObj
}


/**
 * update an user
 * @param userid id of user to modify
 * @param newValues object has to merge into old user
 * @returns Promise<User>
 */
async function updateUserById(userid, newValues, opts = {}) {
    const { 
      transaction = null 
    } = opts
    const updated = await User.update(newValues, {
        where: { id: userid },
        returning: true
    }, { transaction });
    eventUserUpdated(userid).catch(Raven.captureException.bind(Raven))
    return updated
}

/**
 * update an user with WHERE params
 * @param whereParams
 * @param newValues
 * @returns Promise<User>
 */
async function updateUserByParams(whereParams, newValues) {
    if (whereParams.email) {
        whereParams.email = {
            $iLike: whereParams.email
        }
    }
    const updated = await User.update(newValues, {
        where: whereParams,
        returning: true
    })
    const user = await User.findOne({
        attributes: ['id'],
        where: whereParams
    })
    eventUserUpdated(user.id).catch(Raven.captureException.bind(Raven))
    return updated
}

function findUserForTrustedClient(trustedClient, userId, query = {}) {
    return User.findOne({
        attributes: trustedClient ? undefined : ["id", "username", "photo", "graduationYear"],
        where: { id: userId },
        include: [
          {
            model: Demographic,
            include: [College, Branch, Address],
          },
          ...(query.include || [])
        ]
    });
}

function findAllUsersWithFilter(trustedClient, filterArgs) {
    return User.findAll({
        attributes: trustedClient ? undefined : ["id", "username", "email", "firstname", "lastname", "mobile_number"],
        where: generateFilter(filterArgs) || {},
    });
}

function generateFilter(filterArgs) {

    let whereObj = {}

    if (filterArgs.username) {
        whereObj.username = filterArgs.username
    }
    if (filterArgs.firstname) {
        whereObj.firstname = {
            $iLike: `${filterArgs.firstname}%`
        }
    }
    if (filterArgs.lastname) {
        whereObj.lastname = {
            $iLike: `${filterArgs.lastname}%`
        }
    }
    if (filterArgs.email) {
        let email = filterArgs.email

        //Testing if email has dots, i.e. ab.c@gmail.com is same as abc@gmail.com
        whereObj.email =  sequelize.where(
            sequelize.fn('replace', sequelize.col('email'), '.', ''),
            {[sequelize.Op.iLike]: sequelize.fn('replace', email, '.', '')}
        )

    }
    if (filterArgs.contact) {
        let contact = filterArgs.contact
        if(/^\d+$/.test(contact)) {
            whereObj.mobile_number = {
                like: `${contact}%`
            }
        } else {
            throw new Error("Invalid Phone Format")
        }
    }
    if (filterArgs.verified) {
        let verify = (filterArgs.verified === 'true')
        if (verify) {
            whereObj.verifiedemail = {
                $ne: null
            }
        } else {
            whereObj.verifiedemail = {
                $eq: null
            }
        }
    }
    return whereObj

}

async function clearSessionForUser (userId) {
    return db.query(`DELETE FROM SESSIONS WHERE "userId" = ${+userId}`)
}

const createVerifiedUserWithPassword = async (user) => {

    try {
        user.verifiedemail = user.email
        user.userlocal = {
            password: await passutils.pass2hash(user.password)
        }
        let record = await User.create(user, {
            include: [{
                association: User.UserLocal,
            }]
        });
        record = record.get({plain:true})
        record.created = true
        record.error = null
        delete record.userlocal
        return  record
    } catch (e) {
        console.log(e)
        delete user.userlocal
        user.created = false
        user.error = e.message
        return user
    }
}

const insertBulkUsers = async (users) => {
    return await Bluebird.map(users, (user) => {
        return createVerifiedUserWithPassword(user)
    }, {concurrency: 50})
}

const checkRecordsForDuplicacy = async (users) => {
    return await Bluebird.map(users, async (user) => {
        const userRecordUsername = await User.findOne({
            where: {
                username: user.username
            }
        })
        const userRecordEmail = await User.findOne({
            where: {
              verifiedemail: user.email
            }
        })
        if (userRecordUsername && userRecordEmail){
            return {
                ...user,
                error: 'Username and email already exists',
            }
        } else if(userRecordEmail){
            return {
                ...user,
                error: 'Email'
            }
        } else if (userRecordUsername){
            return {
                ...user,
                error: 'Username already exists'
            }
        } else{
            return {
                ...user,
                error: null
            }
        }
    }, {concurrency: 50})
}

module.exports = {
    findAllUsers,
    findUserById,
    findUserByParams,
    createUserLocal,
    updateUserById,
    updateUserByParams,
    findUserForTrustedClient,
    findAllUsersWithFilter,
    createUserWithoutPassword,
    clearSessionForUser,
    insertBulkUsers,
    checkRecordsForDuplicacy
};
