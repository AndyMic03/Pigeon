/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import meow from "meow";
import {createConfig} from "./config.js";
import {Database, deleteDir, Enum, enumsQuery, guided, PigeonError, queryDB, runGeneration} from "./index.js";

import * as path from "node:path";
import fs from "node:fs";
import {getRelationshipsAndTables, tableProcessing} from "./pgAdmin.js";

export const cli = meow(
    `
    Usage
      $ pigeon [options]
 
    Options
      --init    setup the config file. Create a .pigeon.json file at the root of the project
      --guided  run Pigeon using a question based command line interface
      --force   overwrites already existing files
      --output  [path:String] output directory for the generated files.
      --config  [path:String] path to .pigeon.json config file.
      --pgAdmin [path:String] path to the pgAdmin ERD file.
      --offline (only with pgAdmin) does not contact the database
 
    Examples
      $ pigeon --init
      $ pigeon --output C:/Users/User/Documents/Project
      $ pigeon --output ./generatedFiles --force
      $ pigeon --config ./customPigeonConfig.json
      $ pigeon --pgAdmin C:/Users/User/Documents/Project/ERD.json --offline
      
    Exit Status
      Pigeon returns the following codes:
    
      - 0: 
        - Generation succeeded, no errors found. 
      - 1: 
        - Generation failed, errors found.
      - 2: 
        - Unexpected error occurred, fatal error.
`,
    {
        flags: {
            init: {
                type: "boolean",
            },
            guided: {
                type: "boolean",
            },
            output: {
                type: "string",
                default: path.join(process.cwd(), "pigeon"),
            },
            force: {
                type: "boolean",
                default: false,
            },
            config: {
                type: "string",
                default: path.join(process.cwd(), ".pigeon.json"),
            },
            cwd: {
                type: "string",
                default: process.cwd(),
            },
            pgAdmin: {
                type: "string",
            },
            offline: {
                type: "boolean",
                default: false,
            }
        },
        autoHelp: true,
        autoVersion: true,
        importMeta: import.meta,
    }
);

export async function run(flags: any): Promise<void | PigeonError> {
    if (flags.init)
        return createConfig(flags.cwd);
    if (flags.force)
        deleteDir(flags.output);
    if (flags.pgAdmin) {
        let enums: Enum[] | PigeonError;
        let database;
        if (!flags.offline) {
            if (!fs.existsSync(path.join(process.cwd(), ".pigeon.json")))
                return new PigeonError(1, "", new Error("The configuration file does not exist. Generate one using the \"pigeon --init\" command"));

            const params = JSON.parse(fs.readFileSync(flags.config).toString());
            database = new Database(params.host, params.port, params.database, params.username, params.password);
            enums = await enumsQuery(database);
        } else {
            enums = [];
            database = new Database("localhost", "5432", "database", "username", "password");
        }

        if (enums instanceof PigeonError)
            return enums;

        if (!fs.existsSync(flags.pgAdmin))
            return new PigeonError(1, "", new Error("The pgAdmin ERD file specified does not exist."));

        const file = fs.readFileSync(flags.pgAdmin).toString();
        let tables;
        try {
            tables = getRelationshipsAndTables(file).tables;
        } catch (e) {
            return e as PigeonError;
        }
        const generationResult = runGeneration(flags.output, database, tableProcessing(tables), enums);
        if (generationResult instanceof PigeonError)
            return generationResult;
        return;
    }
    if (flags.guided) {
        const params = guided();
        const database = new Database(params.host, String(params.port), params.db, params.user, params.pass);
        const result = await queryDB(database);
        if (result instanceof PigeonError)
            return result;
    }
    if (!fs.existsSync(path.join(process.cwd(), ".pigeon.json")))
        return new PigeonError(1, "", new Error("The configuration file does not exist. Generate one using the \"pigeon --init\" command"));

    const params = JSON.parse(fs.readFileSync(flags.config).toString());
    const database = new Database(params.host, params.port, params.database, params.username, params.password);
    const queryResult = await queryDB(database);
    if (queryResult instanceof PigeonError)
        return queryResult;
    const generationResult = runGeneration(flags.output, database, queryResult.tables, queryResult.enums);
    if (generationResult instanceof PigeonError)
        return generationResult;
}