/*
 * Copyright (c) 2024. Andreas Michael
 * All rights reserved
 */

import {
    arrayMaker,
    getCombinations,
    nameBeautifier,
    queryMaker,
    runQuery,
    singularize,
    sleep,
    tabsInserter
} from "./utils.js"
import {types} from "./maps.js"
import fs from "node:fs";
import * as path from "node:path";
import prompt from "prompt-sync";

function createDir(dirPath: string) {
    if (fs.existsSync(dirPath))
        fs.readdir(dirPath, (err, files) => {
            if (err)
                throw err;
            for (const file of files) {
                const dir = path.join(dirPath, file);
                if (fs.lstatSync(dir).isDirectory())
                    fs.rm(dir, {recursive: true, force: true}, (err) => {
                        if (err) throw err;
                    })
                else
                    fs.unlink(path.join(dirPath, file), (err) => {
                        if (err)
                            throw err;
                    });
            }
        });
    else
        fs.mkdir(dirPath, (err) => {
            if (err) throw err;
        });
}

createDir("../gen");

let host: string;
let port: number;
let db: string;
let user: string;
let pass: string;

function init() {
    const logo =
        `                              @@@@@@@@  
                            @@@@@@@@@@@ 
                            %%@@@@@@@@@@
                           %%%%@@@@@@   
                           %%%%%%@@@    
                          %%%%%%%%%@    
                         %%%%%%%%%%%%   
                       %%%%%%%%%%%%%%%  
                      %%%%%%%%%%%%%%%%  
                    #####%%%%%%%%%%%%%  
                   #######%%%%%%%%%%%%  
                 **#########%%%%%%%%%%% 
                *****#########%%%%%%%%  
              *********#########%%%%%%  
            +************#########%%%   
         ++++++************########%    
       +++++++++*************######     
       +++++++++++*************#        
 *******++++++++++++******              
##********++++                          `;
    console.clear();
    console.log(logo);
    console.log("\n");
    sleep(1000);
    const input = prompt({sigint: true});
    host = input("Database Host: ");
    port = Number(input("Database Port: "));
    db = input("Database Name: ");
    user = input("Database Username: ");
    pass = input("Database Password: ");

    exec().then(() => {
        return;
    });
}

init();

async function exec(): Promise<void> {
    const tableQuery = await runQuery(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema NOT IN
               ('pg_catalog', 'information_schema');`,
        [],
        host,
        port,
        db,
        user,
        pass
    );
    if (typeof tableQuery === "undefined")
        throw "SQL Error";

    let schemas: string[] = [];
    for (const table of tableQuery.rows) {
        if (schemas.includes(table.table_schema))
            continue;
        schemas.push(table.table_schema);
    }
    for (const schema of schemas) {
        createDir("../gen/" + schema);
    }

    for (const table of tableQuery.rows) {
        const columnQuery = await runQuery(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_name = $1::varchar
               AND table_schema = $2::varchar;`,
            [table.table_name, table.table_schema],
            host,
            port,
            db,
            user,
            pass
        );
        if (typeof columnQuery === "undefined")
            throw "SQL Error";

        const pKeyQuery = await runQuery(
            `SELECT ku.column_name
             FROM information_schema.table_constraints AS tc
                      INNER JOIN information_schema.key_column_usage AS ku
                                 ON tc.constraint_type = 'PRIMARY KEY'
                                     AND tc.constraint_name = ku.constraint_name
             WHERE tc.table_schema = $1::varchar
               AND tc.table_name = $2::varchar;`,
            [table.table_schema, table.table_name],
            host,
            port,
            db,
            user,
            pass
        );
        if (typeof pKeyQuery === "undefined")
            throw "SQL Error";
        let pKeys: string[] = []
        for (let pKey of pKeyQuery.rows)
            pKeys.push(pKey.column_name);

        const fKeyQuery = await runQuery(
            `SELECT kcu1.table_schema AS local_schema,
                    kcu1.table_name   AS local_table,
                    kcu1.column_name  AS local_column,
                    kcu2.table_schema AS referenced_schema,
                    kcu2.table_name   AS referenced_table,
                    kcu2.column_name  AS referenced_column
             FROM information_schema.referential_constraints AS rc
                      INNER JOIN information_schema.key_column_usage AS kcu1
                                 ON kcu1.constraint_catalog = rc.constraint_catalog
                                     AND kcu1.constraint_schema = rc.constraint_schema
                                     AND kcu1.constraint_name = rc.constraint_name
                      INNER JOIN information_schema.key_column_usage AS kcu2
                                 ON kcu2.constraint_catalog = rc.unique_constraint_catalog
                                     AND
                                    kcu2.constraint_schema = rc.unique_constraint_schema
                                     AND kcu2.constraint_name = rc.unique_constraint_name
                                     AND kcu2.ordinal_position = kcu1.ordinal_position
             WHERE kcu1.table_schema = $1::varchar
               AND kcu1.table_name = $2::varchar;`,
            [table.table_schema, table.table_name],
            host,
            port,
            db,
            user,
            pass
        );
        if (typeof fKeyQuery === "undefined")
            throw "SQL Error";

        let ts = "import {Client} from \"pg\";\n\n";
        ts += clientMaker(0);
        ts += "\n\n";
        ts += createClass(table.table_name, columnQuery.rows, pKeys, fKeyQuery.rows);
        ts += "\n\n";
        ts += createGetAll(table.table_schema, table.table_name, columnQuery.rows);
        ts += "\n\n";

        let keys = pKeys;
        for (let fKey of fKeyQuery.rows)
            keys.push(fKey.local_column.replaceAll(" ", ""));
        const keyCombinations = getCombinations(keys);
        for (const keys of keyCombinations) {
            ts += createGet(table.table_schema, table.table_name, columnQuery.rows, keys);
            ts += "\n\n";
        }

        fs.writeFileSync("../gen/" + table.table_schema + "/" + table.table_name + ".ts", ts);
    }
}

function createClass(tableName: string, columns: any[], primaryKeys: string[], foreignKeys: any[]): string {
    let text = "";
    text += "export class " + singularize(nameBeautifier(tableName)).replaceAll(" ", "") + " {\n";
    for (const column of columns) {
        let dataType = types.get(column.data_type);
        if (column.is_nullable == "YES")
            dataType += " | undefined";

        let isPrimaryKey = false;
        for (const pKey of primaryKeys)
            if (pKey === column.column_name)
                isPrimaryKey = true;
        let foreignKeyIndex = -1;
        for (let i = 0; i < foreignKeys.length; i++)
            if (foreignKeys[i].local_column === column.column_name)
                foreignKeyIndex = i;

        text += "\t/**\n";
        if (isPrimaryKey)
            text += "\t * A primary key representing the " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(tableName) + " table.\n";
        else if (foreignKeyIndex !== -1)
            text += "\t * A foreign key representing the " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(tableName) + " table and referencing the " + nameBeautifier(foreignKeys[foreignKeyIndex].referenced_column) + " in the " + nameBeautifier(foreignKeys[foreignKeyIndex].referenced_table) + " table in the " + nameBeautifier(foreignKeys[foreignKeyIndex].referenced_schema) + " schema.\n";
        else
            text += "\t * The " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(tableName) + " table.\n";

        text += "\t * @type {" + dataType + "}\n";
        text += "\t */\n";

        text += "\t" + column.column_name + ": " + dataType;
        if (column.column_default !== null) {
            if (!column.column_default.includes("nextval")) {
                if (types.get(column.data_type) === "Date") {
                    if (column.column_default)
                        text += " = new Date()";
                    else
                        text += " = new Date(" + column.column_default.replace(' ', 'T') + ")";
                } else if (types.get(column.data_type) === "number")
                    text += " = " + column.column_default;
                else
                    text += " = \"" + column.column_default + "\"";
            }
        }
        text += ";\n"
    }

    text += "\n";
    text += "\t/**\n";
    text += "\t * Creates a new object for the " + nameBeautifier(tableName) + " table.\n";
    text += "\t * \n"
    for (const column of columns) {
        text += "\t * ";
        text += "@param {" + types.get(column.data_type);
        if (column.is_nullable == "YES")
            text += " | undefined";
        text += "} " + column.column_name;
        text += " - The " + nameBeautifier(column.column_name) + " of the " + nameBeautifier(tableName) + " table. \n";
    }
    text += "\t */\n";
    text += "\tconstructor(";
    for (const column of columns) {
        text += column.column_name + ": " + types.get(column.data_type);
        if (column.is_nullable == "YES")
            text += " | undefined";
        text += ", ";
    }
    text = text.slice(0, -2);
    text += ") {\n";

    for (const column of columns)
        text += "\t\tthis." + column.column_name + " = " + column.column_name + ";\n";
    text += "\t}\n";
    text += "}";
    return text;
}

export function clientMaker(baseTabs: number): string {
    let text: string = "";
    text += tabsInserter(baseTabs) + "const client = new Client({\n";
    text += tabsInserter(baseTabs + 1) + "host: \"" + host + "\",\n";
    text += tabsInserter(baseTabs + 1) + "port: " + port + ",\n";
    text += tabsInserter(baseTabs + 1) + "database: \"" + db + "\",\n";
    text += tabsInserter(baseTabs + 1) + "user: \"" + user + "\",\n";
    text += tabsInserter(baseTabs + 1) + "password: \"" + pass + "\"\n";
    text += tabsInserter(baseTabs) + "});\n";
    return text;
}

function createGetAll(tableSchema: string, tableName: string, columns: any[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const varName = nameBeautifier(tableName).replaceAll(" ", "")[0].toLowerCase() + nameBeautifier(tableName).replaceAll(" ", "").substring(1);
    text += "/**\n";
    text += " * Gets all " + className + " objects from the server.\n";
    text += " *\n";
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning an array of " + nameBeautifier(tableName) + ".\n";
    text += " */\n";
    text += "export async function getAll" + nameBeautifier(tableName).replaceAll(" ", "") + "(): Promise<" + className + "[]> {\n";
    text += queryMaker(1, varName, "SELECT * FROM " + tableSchema + "." + tableName, "");
    text += "\n\n";
    text += arrayMaker(1, varName, className, columns) + "\n";
    text += "\treturn " + varName + ";\n";
    text += "}";
    return text;
}

function createGet(tableSchema: string, tableName: string, columns: any[], keys: string[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const varName = nameBeautifier(tableName).replaceAll(" ", "")[0].toLowerCase() + nameBeautifier(tableName).replaceAll(" ", "").substring(1);
    text += "/**\n";
    text += " * Gets " + className + " objects from the server by ";
    for (const key of keys)
        text += key + " and ";
    text = text.slice(0, -5) + ".\n";
    text += " *\n";
    for (const key of keys) {
        const column = columns.find(column => column.column_name == key);
        text += " * ";
        text += "@param {" + types.get(column.data_type);
        text += "} " + column.column_name;
        text += " - The " + nameBeautifier(column.column_name) + " of the " + nameBeautifier(tableName) + " table. \n";
    }
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning an array of " + nameBeautifier(tableName) + ".\n";
    text += " */\n";
    text += "export async function get" + nameBeautifier(tableName).replaceAll(" ", "") + "By";
    for (const key of keys)
        text += nameBeautifier(key).replaceAll(" ", "") + "And";
    text = text.slice(0, -3);
    text += "(";
    for (const key of keys)
        text += key + ": " + types.get(columns.find(column => column.column_name == key).data_type) + ", ";
    text = text.slice(0, -2);
    text += "): Promise<" + className + "[]> {\n";
    text += "\tif (";
    for (const key of keys)
        text += key + " === undefined || ";
    text = text.slice(0, -4);
    text += ")\n" + "\t\tthrow \"Missing Parameters\";\n\n";
    let query = "SELECT * FROM " + tableSchema + "." + tableName + " WHERE ";
    let parameters = "";
    for (let i = 0; i < keys.length; i++) {
        query += keys[i] + " = " + "$" + (i + 1) + "::" + columns.find(column => column.column_name == keys[i]).data_type + " AND ";
        parameters += keys[i] + ", ";
    }
    query = query.slice(0, -5);
    parameters = parameters.slice(0, -2);
    text += queryMaker(1, varName, query, parameters);
    text += "\n\n";
    text += arrayMaker(1, varName, className, columns) + "\n";
    text += "\t return " + varName + ";\n";
    text += "}";
    return text;
}