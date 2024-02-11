/**
 * Mongo Database connection module
 *
 * Copyright © 2024 Oleg Dubnov
 * https://olegdubnov.com
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';


/** Reads credentials from the environment and establishes connection with the Mongo database */
export class MongoDB {
    /** The MongoDB connection URI */
    private readonly DB_URI: string;

    /** The Mongo client to be used to interact with the database */
    public readonly client: MongoClient;

    constructor() {
        /* If the username and password environment variables are empty, they are not used in the connection URI */
        if (process.env.DB_USERNAME && process.env.DB_PASSWORD) {
            this.DB_URI = 'mongodb://' +
                process.env.DB_USERNAME + ':' +
                process.env.DB_PASSWORD + '@' +
                process.env.DB_HOST + ':' +
                process.env.DB_PORT + '/' +
                process.env.DB_NAME + '?' +
                process.env.DB_ARGS;
        } else {
            this.DB_URI = 'mongodb://' +
                process.env.DB_HOST + ':' +
                process.env.DB_PORT + '/' +
                process.env.DB_NAME + '?' +
                process.env.DB_ARGS;
        }

        /* Creating a new Mongo client ready to monitor commands */
        this.client = new MongoClient(this.DB_URI, { monitorCommands: true });

        /* Uncomment to enable command monitoring */
        // this.client.on('commandStarted', started => console.log(started));

        this.client.connect().then(
            () => console.log('MongoDB connection has been established.')
        )
    }
}