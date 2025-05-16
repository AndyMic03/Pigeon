/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {
    arrayMaker,
    getCombinations,
    getJSType,
    getPGType,
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
import {jsTypes} from "./maps.js";

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

export class Column {
    name: string;
    position: number;
    defaultValue: string | null;
    isNullable: boolean;
    jsType: string;
    pgType: string;
    isIdentity: boolean;
    identityGeneration: string | null;
    isPrimary: boolean;
    isUnique: boolean;
    isForeign: boolean;
    foreignSchema?: string;
    foreignTable?: string;
    foreignColumn?: string;

    constructor(name: string, position: number, defaultValue: string | null, isNullable: boolean, jsType: string, pgType: string, isIdentity: boolean, identityGeneration: string | null, isPrimary: boolean, isUnique: boolean, isForeign: boolean, foreignSchema?: string, foreignTable?: string, foreignColumn?: string) {
        this.name = name;
        this.position = position;
        this.defaultValue = defaultValue;
        this.isNullable = isNullable;
        this.jsType = jsType;
        this.pgType = pgType;
        this.isIdentity = isIdentity;
        this.identityGeneration = identityGeneration;
        this.isPrimary = isPrimary;
        this.isUnique = isUnique;
        this.isForeign = isForeign;
        this.foreignSchema = foreignSchema;
        this.foreignTable = foreignTable;
        this.foreignColumn = foreignColumn;
    }
}

export class Table {
    name: string;
    schema: string;
    columns: Column[] = [];

    constructor(name: string, schema: string, columns: Column[]) {
        this.name = name;
        this.schema = schema;
        this.columns = columns;
    }
}

export class Enum {
    name: string;
    labels: string[];

    constructor(name: string, labels: string[]) {
        this.name = name;
        this.labels = labels;
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

export async function enumsQuery(db: Database): Promise<Enum[] | PigeonError> {
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
        return new PigeonError(1, "", new Error("An SQL error has occurred."));

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
            return new PigeonError(1, "", new Error("An SQL error has occurred."));

        let labels = [];
        for (const enumLabel of enumQuery.rows)
            labels.push(enumLabel.enumlabel);
        enums.push(new Enum(type.typname, labels));
    }
    return enums;
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
        return new PigeonError(1, "", new Error("An SQL error has occurred."));

    const enums = await enumsQuery(db);
    if (enums instanceof PigeonError)
        return enums;

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
            return new PigeonError(1, "", new Error("An SQL error has occurred."));

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
            return new PigeonError(1, "", new Error("An SQL error has occurred."));

        for (const pKey of pKeyQuery.rows)
            for (const column of columnQuery.rows)
                if (pKey.column_name === column.column_name)
                    column.isPrimary = true;

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
            return new PigeonError(1, "", new Error("An SQL error has occurred."));

        for (const fKey of fKeyQuery.rows) {
            for (const column of columnQuery.rows) {
                if (fKey.local_schema === table.table_schema && fKey.local_table === table.table_name && fKey.local_column === column.column_name) {
                    column.isForeign = true;
                    column.foreignSchema = fKey.foreign_schema;
                    column.foreignTable = fKey.foreign_table;
                    column.foreignColumn = fKey.foreign_column;
                }
            }
        }

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
            return new PigeonError(1, "", new Error("An SQL error has occurred."));

        let uniques: string[] = [];
        if (uniqueQuery.rowCount > 0)
            uniques = uniqueQuery.rows[0].columns.slice(1, -1).split(",");

        for (const unique of uniques)
            for (const column of columnQuery.rows)
                if (unique === column.column_name)
                    column.isUnique = true;

        const columns: Column[] = [];
        for (const column of columnQuery.rows) {
            columns.push(new Column(column.column_name, column.ordinal_position, column.column_default, column.is_nullable === "YES", getJSType(column.data_type, column.udt_name, column.is_nullable === "YES"), getPGType(column.data_type, column.udt_name), column.is_identity === "YES", column.identity_generation, column.isPrimary || false, column.isUnique || false, column.isForeign || false, column.foreignSchema, column.foreignTable, column.foreignColumn));
        }

        tables.push(new Table(table.table_name, table.table_schema, columns));
    }
    return {
        tables: tables,
        enums: enums
    }
}


export function runGeneration(dir: string, db: Database, tables: Table[], enums?: Enum[]): void | PigeonError {
    if (tables.length === 0)
        return new PigeonError(1, "", new Error("No tables were found."));
    const dirResult = createDir(dir);
    if (dirResult instanceof PigeonError)
        return dirResult;
    let schemas: string[] = [];
    for (const table of tables) {
        if (schemas.includes(table.schema))
            continue;
        schemas.push(table.schema);
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
                    if (column.pgType.includes(cEnum.name)) {
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

        ts += createClass(table.name, table.columns);
        ts += "\n\n";
        ts += createGetAll(table.schema, table.name, table.columns);
        ts += "\n\n";

        let keys: Column[] = [];
        for (const column of table.columns)
            if (column.isPrimary || column.isForeign || column.isUnique)
                keys.push(column);
        for (const keyCombination of getCombinations(keys)) {
            ts += createGet(table.schema, table.name, table.columns, keyCombination);
            ts += "\n\n";
        }

        let nonDefaults = [];
        let softDefaults = [];
        let hardDefaults = [];
        for (const column of table.columns) {
            if (column.defaultValue === null && !column.isIdentity)
                nonDefaults.push(column);
            else if ((column.defaultValue !== null && !column.defaultValue.includes("nextval")) || (column.isIdentity && column.identityGeneration === "BY DEFAULT"))
                softDefaults.push(column);
            else if ((column.defaultValue !== null && column.defaultValue.includes("nextval")) || (column.isIdentity && column.identityGeneration === "ALWAYS"))
                hardDefaults.push(column);
        }

        ts += createAdd(table.schema, table.name, nonDefaults, [], hardDefaults.concat(softDefaults)) + "\n\n";
        for (const softCombination of getCombinations(softDefaults))
            ts += createAdd(table.schema, table.name, nonDefaults, softCombination, hardDefaults.concat(softDefaults.filter(n => !getCombinations(softDefaults).includes([n])))) + "\n\n";

        for (const keyCombination of getCombinations(keys)) {
            ts += createUpdate(table.schema, table.name, table.columns, keyCombination);
            ts += "\n\n";
        }
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

        fs.writeFileSync(path.join(dir, table.schema, table.name + ".ts"), ts);
    }
}

function createClass(tableName: string, columns: Column[]): string {
    let text = "";
    text += "export class " + singularize(nameBeautifier(tableName)).replaceAll(" ", "") + " {\n";
    for (const column of columns) {
        text += "\t/**\n";
        if (column.isPrimary)
            text += "\t * A primary key representing the " + nameBeautifier(column.name) + " for the " + nameBeautifier(tableName) + " table.\n";
        else if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema)
            text += "\t * A foreign key representing the " + nameBeautifier(column.name) + " for the " + nameBeautifier(tableName) + " table and referencing the " + nameBeautifier(column.foreignColumn) + " in the " + nameBeautifier(column.foreignTable) + " table in the " + nameBeautifier(column.foreignSchema) + " schema.\n";
        else if (column.name.toLowerCase().startsWith("is_"))
            text += "\t * Indicates whether this record in the table " + nameBeautifier(tableName) + " is currently " + nameBeautifier(column.name.slice(3)).toLowerCase() + ".\n";
        else
            text += "\t * The " + nameBeautifier(column.name) + " for the " + nameBeautifier(tableName) + " table.\n";

        text += "\t * @type {" + column.jsType + "}\n";
        text += "\t */\n";

        text += "\t" + column.name + ": " + column.jsType;
        if (column.defaultValue !== null) {
            let columnDefault = column.defaultValue.split("::")[0];
            let type = column.defaultValue.split("::")[1];
            if (!columnDefault.includes("nextval")) {
                if (column.jsType === "Date") {
                    if (columnDefault.toLowerCase() === "now()")
                        text += " = new Date()";
                    else
                        text += " = new Date(" + columnDefault.replace(" ", "T") + ")";
                } else if (column.jsType.includes("number") || column.jsType.includes("boolean"))
                    text += " = " + columnDefault;
                else if (type) {
                    if (jsTypes.get(type) === "string")
                        text += " = \"" + columnDefault + "\"";
                    else {
                        const jsType = jsTypes.get(type);
                        if (jsType)
                            text += " = " + columnDefault + " as " + jsType;
                        else
                            text += " = " + columnDefault + " as " + nameBeautifier(type).replaceAll(" ", "");
                    }
                } else
                    text += " = \"" + column.defaultValue + "\"";
            }
        }
        text += ";\n"
    }

    text += "\n";
    text += "\t/**\n";
    text += "\t * Creates a new object for the " + nameBeautifier(tableName) + " table.\n";
    text += "\t * \n"
    for (const column of columns) {
        text += "\t * @param {" + column.jsType + "} " + column.name;
        if (!column.name.toLowerCase().startsWith("is_"))
            text += " - The " + nameBeautifier(column.name) + " of the " + nameBeautifier(tableName) + " table. \n";
        else
            text += " - Indicates whether this record in the table " + nameBeautifier(tableName) + " is currently " + nameBeautifier(column.name.slice(3)).toLowerCase() + ".\n";
    }
    text += "\t */\n";
    text += "\tconstructor(";
    for (const column of columns)
        text += column.name + ": " + column.jsType + ", ";
    text = text.slice(0, -2);
    text += ") {\n";

    for (const column of columns)
        text += "\t\tthis." + column.name + " = " + column.name + ";\n";
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

function createGetAll(tableSchema: string, tableName: string, columns: Column[]): string {
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

function createGet(tableSchema: string, tableName: string, columns: Column[], keys: Column[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const varName = nameBeautifier(tableName).replaceAll(" ", "")[0].toLowerCase() + nameBeautifier(tableName).replaceAll(" ", "").substring(1);
    text += "/**\n";
    text += " * Gets " + className + " objects from the database by ";
    for (const key of keys)
        text += key.name + " and ";
    text = text.slice(0, -5) + ".\n";
    text += " *\n";
    for (const key of keys)
        text += " * @param {" + key.jsType + "} " + key.name + " - The " + nameBeautifier(key.name) + " of the " + nameBeautifier(tableName) + " table.\n";
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning an array of " + nameBeautifier(tableName) + ".\n";
    text += " */\n";
    text += "export async function get" + nameBeautifier(tableName).replaceAll(" ", "") + "By";
    for (const key of keys)
        text += nameBeautifier(key.name).replaceAll(" ", "") + "And";
    text = text.slice(0, -3);
    text += "(";
    for (const key of keys)
        text += key.name + ": " + key.jsType + ", ";
    text = text.slice(0, -2);
    text += "): Promise<" + className + "[]> {\n";
    text += "\tif (";
    for (const key of keys)
        text += key.name + " === undefined || ";
    text = text.slice(0, -4);
    text += ")\n" + "\t\tthrow \"Missing Parameters\";\n\n";
    let query = "SELECT * FROM " + tableSchema + "." + tableName + " WHERE ";
    let parameters = "";
    for (let i = 0; i < keys.length; i++) {
        query += keys[i].name + " = " + "$" + (i + 1) + "::" + keys[i].pgType + " AND ";
        parameters += keys[i].name + ", ";
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

function createAdd(tableSchema: string, tableName: string, nonDefaults: Column[], softDefaults: Column[], hardDefaults: Column[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    let hasForeign = false;
    for (const column of nonDefaults.concat(softDefaults).concat(hardDefaults).sort((a, b) => a.position - b.position)) {
        if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
            hasForeign = true;
            if ((tableSchema === column.foreignSchema) && (tableName === column.foreignTable))
                continue;
            text += "import {get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "By" + nameBeautifier(column.foreignColumn).replaceAll(" ", "") + "} from \".";
            if (tableSchema !== column.foreignSchema)
                text += "./" + column.foreignSchema;
            text += "/" + column.foreignTable + ".js\";\n";
        }
    }
    text += "/**\n";
    text += " * Adds the provided " + className + " object to the database.\n";
    text += " *\n";
    let columns = nonDefaults.concat(softDefaults);
    columns.sort((a, b) => a.position - b.position);
    for (const column of columns)
        text += " * @param {" + column.jsType + "} " + column.name + " - The " + nameBeautifier(column.name) + " to be inserted into the " + nameBeautifier(tableName) + " table.\n";

    text += " * @returns {Promise<" + className + ">} - A Promise object returning the inserted " + nameBeautifier(tableName) + ".\n";
    if (hasForeign) {
        text += " * @throws string An exception in the case of the ";
        for (const column of columns)
            if (column.isForeign)
                text += nameBeautifier(column.name) + " or the ";
        text = text.slice(0, -8);
        text += " not existing in their table.\n";
    }
    text += " */\n";
    text += "export async function add" + className;
    if (softDefaults.length > 0) {
        text += "With";
        for (const softDefault of softDefaults)
            text += nameBeautifier(softDefault.name).replaceAll(" ", "") + "And";
        text = text.slice(0, -3);
    }
    text += "(";
    for (const column of columns)
        text += column.name + ": " + column.jsType + ", ";

    text = text.slice(0, -2);
    text += "): Promise<" + className + "> {\n";
    if (hasForeign) {
        for (const column of columns) {
            if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
                const name = nameBeautifier(column.name).replaceAll(" ", "");
                if (column.isNullable) {
                    text += "\tif (" + column.name + ") {\n";
                    text += "\t\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "By" + nameBeautifier(column.foreignColumn).replaceAll(" ", "") + "(" + column.name + ");\n";
                    text += "\t\tif (verify" + name + ".length === 0)\n";
                    text += "\t\t\tthrow \"The " + nameBeautifier(column.name) + " provided does not exist.\";\n";
                    text += "\t}\n\n"
                } else {
                    text += "\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "By" + nameBeautifier(column.foreignColumn).replaceAll(" ", "") + "(" + column.name + ");\n";
                    text += "\tif (verify" + name + ".length === 0)\n";
                    text += "\t\tthrow \"The " + nameBeautifier(column.name) + " provided does not exist.\";\n\n";
                }
            }
        }
    }
    let query = "INSERT INTO " + tableSchema + "." + tableName + " (";
    for (const column of columns)
        query += column.name + ", ";
    query = query.slice(0, -2);
    query += ") VALUES (";
    let parameters = "";
    for (let i = 0; i < columns.length; i++) {
        query += "$" + (i + 1) + "::" + columns[i].pgType + ", ";
        parameters += columns[i].name + ", ";
    }
    query = query.slice(0, -2);
    parameters = parameters.slice(0, -2);
    query += ") RETURNING *;";
    text += queryMaker(1, "insert", query, parameters);
    text += "\n\n";
    text += "\treturn new " + className + "(\n";
    columns = columns.concat(hardDefaults);
    columns = [...new Set(columns)];
    columns.sort((a, b) => a.position - b.position);
    for (const column of columns)
        text += "\t\tinsertQuery.rows[0]." + column.name + ",\n";
    text = text.slice(0, -2);
    text += "\n";
    text += "\t);\n";
    text += "}";
    return text;
}

function createUpdate(tableSchema: string, tableName: string, columns: Column[], keys: Column[]) {
    const optionals = columns.filter(column => !keys.includes(column));
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    let hasForeign = false;
    for (const column of columns) {
        if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
            hasForeign = true;
            if ((tableSchema === column.foreignSchema) && (tableName === column.foreignTable))
                continue;
            text += "import {get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "By" + nameBeautifier(column.foreignColumn).replaceAll(" ", "") + "} from \".";
            if (tableSchema !== column.foreignSchema)
                text += "./" + column.foreignSchema;
            text += "/" + column.foreignTable + ".js\";\n";
        }
    }
    text += "/**\n";
    text += " * Updates the " + className + " objects from the database by ";
    for (const key of keys)
        text += key.name + " and ";
    text = text.slice(0, -5) + ".\n";
    text += " *\n";
    for (const key of keys)
        text += " * @param {" + key.jsType.replace(" | null", "") + "} " + key.name + " - The " + nameBeautifier(key.name) + " of the " + nameBeautifier(tableName) + " table to be updated.\n";
    for (const optional of optionals)
        text += " * @param {" + optional.jsType + " | undefined} " + optional.name + " - The value of the" + nameBeautifier(optional.name) + " of the " + nameBeautifier(tableName) + " table to be updated.\n";
    text += " * @returns {Promise<" + className + ">} - A Promise object returning the updated " + nameBeautifier(tableName) + ".\n";
    if (hasForeign) {
        text += " * @throws string An exception in the case of the ";
        for (const column of columns)
            if (column.isForeign)
                text += nameBeautifier(column.name) + " or the ";
        text = text.slice(0, -8);
        text += " not existing in their table.\n"
    }
    text += " */\n";
    text += "export async function update" + className + "By";
    for (const key of keys)
        text += nameBeautifier(key.name).replaceAll(" ", "") + "And";
    text = text.slice(0, -3);
    text += "(";
    for (const key of keys)
        text += key.name + ": " + key.jsType.replace(" | null", "") + ", ";
    for (const optional of optionals)
        text += optional.name + "?: " + optional.jsType + " | undefined, ";
    text = text.slice(0, -2);
    text += "): Promise<" + className + "> {\n";
    if (hasForeign) {
        for (const column of columns) {
            if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
                const name = nameBeautifier(column.name).replaceAll(" ", "");
                if (!keys.includes(column)) {
                    text += "\tif (" + column.name + ") {\n";
                    text += "\t\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "By" + nameBeautifier(column.foreignColumn).replaceAll(" ", "") + "(" + column.name + ");\n";
                    text += "\t\tif (verify" + name + ".length === 0)\n";
                    text += "\t\t\tthrow \"The " + nameBeautifier(column.name) + " provided does not exist.\";\n";
                    text += "\t}\n\n"
                } else {
                    text += "\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "By" + nameBeautifier(column.foreignColumn).replaceAll(" ", "") + "(" + column.name + ");\n";
                    text += "\tif (verify" + name + ".length === 0)\n";
                    text += "\t\tthrow \"The " + nameBeautifier(column.name) + " provided does not exist.\";\n\n";
                }
            }
        }
    }
    text += "\tlet set = \"\";\n";
    for (let optional of optionals) {
        text += "\tif (" + optional.name + " !== undefined)\n";
        text += "\t\tset += \"" + optional.name + " = '\" + " + optional.name + " + \"', \";\n";
    }
    text += "\tset = set.slice(0, -2);\n";
    let parameters = "";
    let query = "UPDATE " + tableSchema + "." + tableName + ` SET \$\{set\} WHERE `
    for (let i = 0; i < keys.length; i++) {
        query += keys[i].name + " = " + "$" + (i + 1) + "::" + keys[i].pgType + " AND ";
        parameters += keys[i].name + ", ";
    }
    parameters = parameters.slice(0, -2);
    query = query.slice(0, -5) + " RETURNING *;"
    text += queryMaker(1, "update", query, parameters);
    text += "\n\n";
    text += "\treturn new " + className + "(\n";
    for (const column of columns)
        text += "\t\tupdateQuery.rows[0]." + column.name + ",\n";
    text = text.slice(0, -2);
    text += "\n";
    text += "\t);\n";
    text += "}";
    return text;
}