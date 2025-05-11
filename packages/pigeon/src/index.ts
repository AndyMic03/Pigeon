/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {
    arrayMaker,
    consoleMessage,
    getCombinations,
    getType,
    nameBeautifier,
    queryMaker,
    runQuery,
    singularize,
    sleep,
    tabsInserter
} from "./utils.js";

import prompt from "prompt-sync";

import fs from "node:fs";
import * as path from "node:path";

export class PigeonError {
    exitCode: number;
    message: string;
    error: Error | null;

    constructor(exitCode: number, message: string, error: Error | null) {
        this.exitCode = exitCode;
        this.message = message;
        this.error = error;
    }
}

export class Database {
    host: string;
    port: string;
    db: string;
    user: string;
    pass: string;

    constructor(host: string, port: string, db: string, user: string, pass: string) {
        this.host = host;
        this.port = port;
        this.db = db;
        this.user = user;
        this.pass = pass;
    }
}

class Table {
    table_schema: string;
    table_name: string;
    columns: ColumnQueryRow[] = [];
    primaryKey: PrimaryKeyQueryRow | undefined;
    foreignKeys: ForeignKeyQueryRow[] | undefined;
    unique: UniqueQueryRow | undefined;

    constructor(table_schema: string, table_name: string, columns: ColumnQueryRow[], primaryKey: PrimaryKeyQueryRow | undefined, foreignKeys: ForeignKeyQueryRow[] | undefined, unique: UniqueQueryRow | undefined) {
        this.table_schema = table_schema;
        this.table_name = table_name;
        this.columns = columns;
        this.primaryKey = primaryKey;
        this.foreignKeys = foreignKeys;
        this.unique = unique;
    }
}

class Enum {
    name: string;
    labels: string[];

    constructor(name: string, labels: string[]) {
        this.name = name;
        this.labels = labels;
    }
}

class ColumnQueryRow {
    column_name: string;
    ordinal_position: number;
    column_default: string;
    is_nullable: string;
    data_type: string;
    udt_name: string;
    is_identity: string;
    identity_generation: string;

    constructor(column_name: string, ordinal_position: number, column_default: string, is_nullable: string, data_type: string, udt_name: string, is_identity: string, identity_generation: string) {
        this.column_name = column_name;
        this.ordinal_position = ordinal_position;
        this.column_default = column_default;
        this.is_nullable = is_nullable;
        this.data_type = data_type;
        this.udt_name = udt_name;
        this.is_identity = is_identity;
        this.identity_generation = identity_generation;
    }
}

class PrimaryKeyQueryRow {
    column_name: string;

    constructor(column_name: string) {
        this.column_name = column_name;
    }
}

class ForeignKeyQueryRow {
    local_table: string;
    local_column: string;
    foreign_schema: string;
    foreign_table: string;
    foreign_column: string;

    constructor(local_table: string, local_column: string, foreign_schema: string, foreign_table: string, foreign_column: string) {
        this.local_table = local_table;
        this.local_column = local_column;
        this.foreign_schema = foreign_schema;
        this.foreign_table = foreign_table;
        this.foreign_column = foreign_column;
    }
}

class UniqueQueryRow {
    columns: string[];

    constructor(columns: string[]) {
        this.columns = columns;
    }
}

function createDir(dirPath: string): void | PigeonError {
    if (fs.existsSync(dirPath))
        return new PigeonError(1, "", new Error("Generation directory already exists. Add the --force flag if you want to overwrite it."));
    else
        fs.mkdirSync(dirPath);
}

export function deleteDir(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const dir = path.join(dirPath, file);
            if (fs.lstatSync(dir).isDirectory())
                fs.rmSync(dir, {recursive: true, force: true});
            else
                fs.unlinkSync(path.join(dirPath, file));
        }
        fs.rmSync(dirPath, {recursive: true, force: true});
    }
}

export function guided() {
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
    const host = input("Database Host: ");
    const port = Number(input("Database Port: "));
    const db = input("Database Name: ");
    const user = input("Database Username: ");
    const pass = input("Database Password: ");
    return {host, port, db, user, pass};
}

export async function queryDB(db: Database): Promise<{ tables: Table[], enums: Enum[] } | PigeonError> {
    const tableQuery = await runQuery(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema NOT IN
               ('pg_catalog', 'information_schema');`,
        [],
        db
    );
    if (typeof tableQuery === "undefined")
        return new PigeonError(1, "", new Error("An SQL error has occurred."))

    const customTypeQuery = await runQuery(
        `SELECT t.oid, t.typname
         FROM pg_type t
         WHERE (t.typrelid = 0 OR t.typrelid IN (SELECT oid FROM pg_class WHERE relkind = 'c'))
           AND t.typelem = 0
           AND t.typnamespace NOT IN
               (SELECT oid FROM pg_namespace WHERE nspname IN ('pg_catalog', 'information_schema'));`,
        [],
        db
    );
    if (typeof customTypeQuery === "undefined")
        return new PigeonError(1, "", new Error("An SQL error has occurred."))

    const enums = [];
    for (const type of customTypeQuery.rows) {
        const enumQuery = await runQuery(
            `SELECT enumlabel
             FROM pg_enum
             WHERE enumtypid = $1::oid
             ORDER BY enumsortorder;`,
            [type.oid],
            db
        );
        if (typeof enumQuery === "undefined")
            return new PigeonError(1, "", new Error("An SQL error has occurred."))

        let labels = [];
        for (const enumLabel of enumQuery.rows)
            labels.push(enumLabel.enumlabel);
        enums.push(new Enum(type.typname, labels));
    }

    const tables: Table[] = [];
    for (const table of tableQuery.rows) {
        const columnQuery = await runQuery(
            `SELECT column_name,
                    ordinal_position,
                    column_default,
                    is_nullable,
                    data_type,
                    udt_name,
                    is_identity,
                    identity_generation
             FROM information_schema.columns
             WHERE table_name = $1::varchar
               AND table_schema = $2::varchar;`,
            [table.table_name, table.table_schema],
            db
        );
        if (typeof columnQuery === "undefined")
            return new PigeonError(1, "", new Error("An SQL error has occurred."))

        const pKeyQuery = await runQuery(
            `SELECT ku.column_name
             FROM information_schema.table_constraints AS tc
                      INNER JOIN information_schema.key_column_usage AS ku
                                 ON tc.constraint_type = 'PRIMARY KEY'
                                     AND tc.constraint_name = ku.constraint_name
             WHERE tc.table_schema = $1::varchar
               AND tc.table_name = $2::varchar;`,
            [table.table_schema, table.table_name],
            db
        );
        if (typeof pKeyQuery === "undefined")
            return new PigeonError(1, "", new Error("An SQL error has occurred."))

        const fKeyQuery = await runQuery(
            `SELECT kcu1.table_schema AS local_schema,
                    kcu1.table_name   AS local_table,
                    kcu1.column_name  AS local_column,
                    kcu2.table_schema AS foreign_schema,
                    kcu2.table_name   AS foreign_table,
                    kcu2.column_name  AS foreign_column
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
            db
        );
        if (typeof fKeyQuery === "undefined")
            return new PigeonError(1, "", new Error("An SQL error has occurred."))

        const uniqueQuery = await runQuery(
            `SELECT array_agg(a.attname) AS columns
             FROM pg_constraint AS c
                      CROSS JOIN LATERAL unnest(c.conkey) AS k(c)
                      JOIN pg_attribute AS a ON a.attnum = k.c AND a.attrelid = c.conrelid
             WHERE c.contype = 'u'
               AND c.connamespace = $1::regnamespace
               AND c.conrelid = $2::regclass
             GROUP BY c.conrelid;
            `,
            [table.table_schema, table.table_name],
            db);
        if (typeof uniqueQuery === "undefined")
            return new PigeonError(1, "", new Error("An SQL error has occurred."))

        let uniques: string[] = [];
        if (uniqueQuery.rowCount > 0)
            uniques = uniqueQuery.rows[0].columns.slice(1, -1).split(",");
        tables.push(new Table(table.table_schema, table.table_name, columnQuery.rows, pKeyQuery.rows[0], fKeyQuery.rows, {columns: uniques}));
    }
    return {
        tables: tables,
        enums: enums
    }
}


export function runGeneration(dir: string, db: Database, tables: Table[] | undefined, enums: Enum[] | undefined): void | PigeonError {
    if (!tables)
        return new PigeonError(1, "", new Error("No tables were found."));
    const dirResult = createDir(dir);
    if (dirResult instanceof PigeonError)
        return dirResult;
    let schemas: string[] = [];
    for (const table of tables) {
        if (schemas.includes(table.table_schema))
            continue;
        schemas.push(table.table_schema);
    }
    for (const schema of schemas) {
        const dirResult = createDir(path.join(dir, schema));
        if (dirResult instanceof PigeonError)
            return dirResult;
    }

    for (const table of tables) {
        let ts = clientMaker(0, db);
        ts += "\n\n";

        if (enums) {
            for (const cEnum of enums) {
                for (const column of table.columns) {
                    if (cEnum.name === column.udt_name) {
                        const enumName = nameBeautifier(cEnum.name).replaceAll(" ", "");
                        ts += "/**\n An Enum representing the " + nameBeautifier(cEnum.name).toLowerCase() + ".\n * @readonly\n * @enum {string}\n */\n";
                        ts += "class " + enumName + " {\n";

                        let longestLabel = 0;
                        for (const label of cEnum.labels)
                            if (label.length > longestLabel)
                                longestLabel = label.length;

                        for (const label of cEnum.labels)
                            ts += "\tstatic " + label.toUpperCase().replaceAll(/[^a-zA-Z0-9$]/g, "_") + ": string" + " ".repeat(longestLabel - label.length + 1) + "= \"" + label + "\";\n";
                        ts += "}\n\n"
                    }
                }
            }
        }

        ts += createClass(table.table_name, table.columns, table.primaryKey?.column_name, table.foreignKeys);
        ts += "\n\n";
        ts += createGetAll(table.table_schema, table.table_name, table.columns);
        ts += "\n\n";

        let keys = [];
        if (table.primaryKey)
            keys.push(table.primaryKey.column_name);
        if (table.foreignKeys)
            for (const fKey of table.foreignKeys)
                keys.push(fKey.local_column.replaceAll(" ", ""));
        if (table.unique)
            keys = keys.concat(table.unique.columns);
        keys = [...new Set(keys)];
        for (const keyCombination of getCombinations(keys)) {
            ts += createGet(table.table_schema, table.table_name, table.columns, keyCombination);
            ts += "\n\n";
        }

        let nonDefaults = [];
        let softDefaults = [];
        let hardDefaults = [];
        for (const column of table.columns) {
            if (column.column_default === null && column.is_identity === "NO")
                nonDefaults.push(column);
            else if ((column.column_default !== null && !column.column_default.includes("nextval")) || (column.is_identity === "YES" && column.identity_generation === "BY DEFAULT"))
                softDefaults.push(column);
            else if ((column.column_default !== null && column.column_default.includes("nextval")) || (column.is_identity === "YES" && column.identity_generation === "ALWAYS"))
                hardDefaults.push(column);
        }

        ts += createAdd(table.table_schema, table.table_name, nonDefaults, [], hardDefaults.concat(softDefaults), table.foreignKeys) + "\n\n";
        for (const softCombination of getCombinations(softDefaults))
            ts += createAdd(table.table_schema, table.table_name, nonDefaults, softCombination, hardDefaults.concat(softDefaults.filter(n => !getCombinations(softDefaults).includes([n]))), table.foreignKeys) + "\n\n";
        ts = ts.slice(0, -2);

        const regex = /import ({?.*?}?) from "(.*?)";\n/g;
        let importObjects = [];

        const matches = ts.matchAll(regex);
        let charOffset = 0;
        for (const match of matches) {
            ts = ts.slice(0, match.index - charOffset) + ts.slice(match.index - charOffset + match[0].length);
            charOffset += match[0].length;
            let fileExists = false;
            const isBrackets = match[1][0] === "{";
            for (const object of importObjects) {
                if (object.file === match[2] && isBrackets === object.brackets) {
                    fileExists = true;
                    object.functions.push(match[1]);
                }
            }
            if (!fileExists) {
                importObjects.push({
                    file: match[2],
                    functions: [match[1]],
                    brackets: isBrackets
                });
            }
        }
        let importString = "";
        for (const object of importObjects) {
            object.functions = [...new Set(object.functions)];
            importString += "import ";
            if (object.brackets)
                importString += "{";
            for (const fun of object.functions) {
                if (object.brackets)
                    importString += fun.slice(1, -1) + ", ";
                else
                    importString += fun + ", ";
            }
            importString = importString.slice(0, -2);
            if (object.brackets)
                importString += "}";
            importString += " from \"" + object.file + "\";\n";
        }
        importString += "import pg from \"pg\";\n\n";
        importString += "const {Client} = pg;\n\n";
        ts = importString + ts;

        fs.writeFileSync(path.join(dir, table.table_schema, table.table_name + ".ts"), ts);
    }
}

function createClass(tableName: string, columns: ColumnQueryRow[], primaryKey?: string, foreignKeys?: ForeignKeyQueryRow[]): string {
    let text = "";
    text += "export class " + singularize(nameBeautifier(tableName)).replaceAll(" ", "") + " {\n";
    for (const column of columns) {
        let dataType = getType(column.data_type, column.udt_name).replaceAll(" ", "");
        if (column.is_nullable === "YES")
            dataType += " | undefined";

        let isPrimaryKey = false;
        if (column.column_name === primaryKey)
            isPrimaryKey = true;

        let foreignKeyIndex;
        if (foreignKeys)
            for (let i = 0; i < foreignKeys.length; i++)
                if (foreignKeys[i].local_column === column.column_name)
                    foreignKeyIndex = i;

        text += "\t/**\n";
        if (isPrimaryKey)
            text += "\t * A primary key representing the " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(tableName) + " table.\n";
        else if (foreignKeys && foreignKeyIndex)
            text += "\t * A foreign key representing the " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(tableName) + " table and referencing the " + nameBeautifier(foreignKeys[foreignKeyIndex].foreign_column) + " in the " + nameBeautifier(foreignKeys[foreignKeyIndex].foreign_table) + " table in the " + nameBeautifier(foreignKeys[foreignKeyIndex].foreign_schema) + " schema.\n";
        else if (column.column_name.toLowerCase().startsWith('is_'))
            text += "\t * Indicates whether this record in the table " + nameBeautifier(tableName) + " is currently " + nameBeautifier(column.column_name.slice(3)).toLowerCase() + ".\n";
        else
            text += "\t * The " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(tableName) + " table.\n";

        text += "\t * @type {" + dataType + "}\n";
        text += "\t */\n";

        text += "\t" + column.column_name + ": " + dataType;
        if (column.column_default !== null) {
            if (!column.column_default.includes("nextval")) {
                if (dataType === "Date") {
                    if (column.column_default)
                        text += " = new Date()";
                    else
                        text += " = new Date(" + column.column_default.replace(' ', 'T') + ")";
                } else if (dataType === "number" || dataType === "boolean")
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
        let dataType = getType(column.data_type, column.udt_name).replaceAll(" ", "");
        text += "\t * ";
        text += "@param {" + dataType;
        if (column.is_nullable === "YES")
            text += " | undefined";
        text += "} " + column.column_name;
        if (!column.column_name.toLowerCase().startsWith('is_'))
            text += " - The " + nameBeautifier(column.column_name) + " of the " + nameBeautifier(tableName) + " table. \n";
        else
            text += " - Indicates whether this record in the table " + nameBeautifier(tableName) + " is currently " + nameBeautifier(column.column_name.slice(3)).toLowerCase() + ".\n";
    }
    text += "\t */\n";
    text += "\tconstructor(";
    for (const column of columns) {
        let dataType = getType(column.data_type, column.udt_name).replaceAll(" ", "");
        text += column.column_name + ": " + dataType;
        if (column.is_nullable === "YES")
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

export function clientMaker(baseTabs: number, db: Database): string {
    let text: string = "";
    text += tabsInserter(baseTabs) + "const client = new Client({\n";
    text += tabsInserter(baseTabs + 1) + "host: \"" + db.host + "\",\n";
    text += tabsInserter(baseTabs + 1) + "port: " + db.port + ",\n";
    text += tabsInserter(baseTabs + 1) + "database: \"" + db.db + "\",\n";
    text += tabsInserter(baseTabs + 1) + "user: \"" + db.user + "\",\n";
    text += tabsInserter(baseTabs + 1) + "password: \"" + db.pass + "\"\n";
    text += tabsInserter(baseTabs) + "});";
    return text;
}

function createGetAll(tableSchema: string, tableName: string, columns: ColumnQueryRow[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const varName = nameBeautifier(tableName).replaceAll(" ", "")[0].toLowerCase() + nameBeautifier(tableName).replaceAll(" ", "").substring(1);
    text += "/**\n";
    text += " * Gets all " + className + " objects from the database.\n";
    text += " *\n";
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning an array of " + nameBeautifier(tableName) + ".\n";
    text += " */\n";
    text += "export async function getAll" + nameBeautifier(tableName).replaceAll(" ", "") + "(): Promise<" + className + "[]> {\n";
    text += queryMaker(1, varName, "SELECT * FROM " + tableSchema + "." + tableName + ";", "");
    text += "\n\n";
    text += arrayMaker(1, varName, className, columns) + "\n";
    text += "\treturn " + varName + ";\n";
    text += "}";
    return text;
}

function createGet(tableSchema: string, tableName: string, columns: ColumnQueryRow[], keys: string[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const varName = nameBeautifier(tableName).replaceAll(" ", "")[0].toLowerCase() + nameBeautifier(tableName).replaceAll(" ", "").substring(1);
    text += "/**\n";
    text += " * Gets " + className + " objects from the database by ";
    for (const key of keys)
        text += key + " and ";
    text = text.slice(0, -5) + ".\n";
    text += " *\n";
    for (const key of keys) {
        const column = columns.find(column => column.column_name === key);
        if (!column) {
            consoleMessage("WRN", `Key ${key} was not found in the columns of table ${tableName}.`);
            continue;
        }
        let dataType = getType(column.data_type, column.udt_name).replaceAll(" ", "");
        text += " * ";
        text += "@param {" + dataType;
        text += "} " + column.column_name;
        text += " - The " + nameBeautifier(column.column_name) + " of the " + nameBeautifier(tableName) + " table.\n";
    }
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning an array of " + nameBeautifier(tableName) + ".\n";
    text += " */\n";
    text += "export async function get" + nameBeautifier(tableName).replaceAll(" ", "") + "By";
    for (const key of keys)
        text += nameBeautifier(key).replaceAll(" ", "") + "And";
    text = text.slice(0, -3);
    text += "(";
    for (const key of keys) {
        const column = columns.find(column => column.column_name === key);
        if (!column) {
            consoleMessage("WRN", `Key ${key} was not found in the columns of table ${tableName}.`);
            continue;
        }
        text += key + ": " + getType(column.data_type, column.udt_name) + ", ";
    }
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
        const column = columns.find(column => column.column_name === keys[i]);
        if (!column) {
            consoleMessage("WRN", `Key ${keys[i]} was not found in the columns of table ${tableName}.`);
            continue;
        }
        query += keys[i] + " = " + "$" + (i + 1) + "::" + (column.data_type || column.udt_name) + " AND ";
        parameters += keys[i] + ", ";
    }
    query = query.slice(0, -5) + ";";
    parameters = parameters.slice(0, -2);
    text += queryMaker(1, varName, query, parameters);
    text += "\n\n";
    text += arrayMaker(1, varName, className, columns) + "\n";
    text += "\treturn " + varName + ";\n";
    text += "}";
    return text;
}

function createAdd(tableSchema: string, tableName: string, nonDefaults: ColumnQueryRow[], softDefaults: ColumnQueryRow[], hardDefaults: ColumnQueryRow[], foreignKeys?: ForeignKeyQueryRow[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    if (foreignKeys) {
        for (const foreignKey of foreignKeys) {
            if ((tableSchema === foreignKey.foreign_schema) && (tableName === foreignKey.foreign_table))
                continue;
            text += "import {get" + nameBeautifier(foreignKey.foreign_table).replaceAll(" ", "") + "By" + nameBeautifier(foreignKey.foreign_column).replaceAll(" ", "") + "} from \".";
            if (tableSchema !== foreignKey.foreign_schema)
                text += "./" + foreignKey.foreign_schema;
            text += "/" + foreignKey.foreign_table + ".js\";\n";
        }
    }
    text += "/**\n";
    text += " * Adds the provided " + className + " object to the database.\n";
    text += " *\n";
    let columns = nonDefaults.concat(softDefaults);
    columns.sort((a, b) => a.ordinal_position - b.ordinal_position);
    for (const column of columns) {
        let dataType = getType(column.data_type, column.udt_name).replaceAll(" ", "");
        text += " * ";
        text += "@param {" + dataType;
        if (column.is_nullable === "YES")
            text += " | undefined";
        text += "} " + column.column_name;
        text += " - The " + nameBeautifier(column.column_name) + " to be inserted into the " + nameBeautifier(tableName) + " table.\n";
    }
    text += " * @returns {Promise<" + className + ">} - A Promise object returning the inserted " + nameBeautifier(tableName) + ".\n";
    if (foreignKeys && foreignKeys.length > 0) {
        text += " * @throws string An exception in the case of the "
        for (const foreignKey of foreignKeys)
            text += nameBeautifier(foreignKey.local_column) + " or the "
        text = text.slice(0, -8);
        text += " not existing in their table.\n"
    }
    text += " */\n";
    text += "export async function add" + className;
    if (softDefaults.length > 0) {
        text += "With";
        for (const softDefault of softDefaults)
            text += nameBeautifier(softDefault.column_name).replaceAll(" ", "") + "And";
        text = text.slice(0, -3);
    }
    text += "(";
    for (const column of columns) {
        let dataType = getType(column.data_type, column.udt_name);
        text += column.column_name + ": " + dataType;
        if (column.is_nullable === "YES")
            text += " | undefined";
        text += ", ";
    }
    text = text.slice(0, -2);
    text += "): Promise<" + className + "> {\n";
    if (foreignKeys) {
        for (const foreignKey of foreignKeys) {
            const column = columns.find(column => column.column_name === foreignKey.local_column);
            if (!column) {
                consoleMessage("WRN", `Key ${foreignKey} was not found in the columns of table ${tableName}.`);
                continue;
            }
            if (column.is_nullable === "YES") {
                text += "\tif (" + foreignKey.local_column + ") {\n";
                text += "\t\tconst verify" + nameBeautifier(foreignKey.local_column).replaceAll(" ", "") + " = await get" + nameBeautifier(foreignKey.foreign_table).replaceAll(" ", "") + "By" + nameBeautifier(foreignKey.foreign_column).replaceAll(" ", "") + "(" + foreignKey.local_column + ");\n";
                text += "\t\tif (verify" + nameBeautifier(foreignKey.local_column).replaceAll(" ", "") + ".length === 0)\n";
                text += "\t\t\tthrow \"The " + nameBeautifier(foreignKey.local_column) + " provided does not exist.\";\n";
                text += "\t}\n\n"
            } else {
                text += "\tconst verify" + nameBeautifier(foreignKey.local_column).replaceAll(" ", "") + " = await get" + nameBeautifier(foreignKey.foreign_table).replaceAll(" ", "") + "By" + nameBeautifier(foreignKey.foreign_column).replaceAll(" ", "") + "(" + foreignKey.local_column + ");\n";
                text += "\tif (verify" + nameBeautifier(foreignKey.local_column).replaceAll(" ", "") + ".length === 0)\n";
                text += "\t\tthrow \"The " + nameBeautifier(foreignKey.local_column) + " provided does not exist.\";\n\n";
            }
        }
    }
    let query = "INSERT INTO " + tableSchema + "." + tableName + " (";
    for (const column of columns)
        query += column.column_name + ", ";
    query = query.slice(0, -2);
    query += ") VALUES (";
    let parameters = "";
    for (let i = 0; i < columns.length; i++) {
        let dataType = columns[i].udt_name;
        if (dataType[0] === "_")
            dataType = dataType.slice(1) + "[]";
        else if (columns[i].data_type !== "USER-DEFINED")
            dataType = columns[i].data_type;
        query += "$" + (i + 1) + "::" + dataType + ", ";
        parameters += columns[i].column_name + ", ";
    }
    query = query.slice(0, -2);
    parameters = parameters.slice(0, -2);
    query += ") RETURNING *;";
    text += queryMaker(1, "insert", query, parameters);
    text += "\n\n";
    text += "\treturn new " + className + "(\n";
    columns = columns.concat(hardDefaults);
    columns = [...new Set(columns)];
    columns.sort((a, b) => a.ordinal_position - b.ordinal_position);
    for (const column of columns)
        text += "\t\tinsertQuery.rows[0]." + column.column_name + ",\n";
    text = text.slice(0, -2);
    text += "\n";
    text += "\t);\n";
    text += "}";
    return text;
}