/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {arrayMaker, getJSType, getPGType, nameBeautifier, runQuery, singularize, sleep,} from "./utils.js";

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
        fs.writeFileSync(path.join(dir, schema, "index.ts"), createIndex(db));
    }

    for (const table of tables) {
        let ts = "";

        const imports: string[] = [];
        for (const column of table.columns) {
            if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
                if ((table.schema === column.foreignSchema) && (table.name === column.foreignTable))
                    continue;
                if (imports.includes(column.foreignSchema + "/" + column.foreignTable))
                    continue;
                ts += "import {get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "} from \".";
                if (table.schema !== column.foreignSchema)
                    ts += "./" + column.foreignSchema;
                ts += "/" + column.foreignTable + ".js\";\n";
                imports.push(column.foreignSchema + "/" + column.foreignTable);
            }
        }
        if (imports.length !== 0)
            ts += "\n";
        ts += "import query from \"./index.js\";\n\n"

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

        ts += createGetTypecast(table.columns);
        ts += "\n\n";

        ts += createGet(table.schema, table.name, table.columns);
        ts += "\n\n";

        let keys: Column[] = [];
        for (const column of table.columns)
            if (column.isPrimary || column.isForeign || column.isUnique)
                keys.push(column);

        let required = [];
        let optional = [];
        let autoGenerated = [];
        for (const column of table.columns) {
            if (column.defaultValue === null && !column.isIdentity)
                required.push(column);
            else if ((column.defaultValue !== null && !column.defaultValue.includes("nextval")) || (column.isIdentity && column.identityGeneration === "BY DEFAULT"))
                optional.push(column);
            else if ((column.defaultValue !== null && column.defaultValue.includes("nextval")) || (column.isIdentity && column.identityGeneration === "ALWAYS"))
                autoGenerated.push(column);
        }

        ts += createAdd(table.schema, table.name, required, optional, autoGenerated, imports.length !== 0);
        ts += "\n\n";

        ts += createUpdate(table.schema, table.name, table.columns, autoGenerated, imports.length !== 0);
        ts += "\n\n"

        ts += createDelete(table.schema, table.name, table.columns);

        fs.writeFileSync(path.join(dir, table.schema, table.name + ".ts"), ts);
    }
}

function createIndex(db: Database) {
    let text = "";
    text += "import pg from \"pg\";\n";
    text += "const { Client, Pool } = pg;\n";
    text += "\n";
    text += "const pool = new Pool({\n";
    text += "\thost: \"" + db.host + "\",\n";
    text += "\tport: " + db.port + ",\n";
    text += "\tdatabase: \"" + db.db + "\",\n";
    text += "\tuser: \"" + db.user + "\",\n";
    text += "\tpassword: \"" + db.pass + "\",\n";
    text += "\tmax: 20,\n";
    text += "\tidleTimeoutMillis: 30000,\n"
    text += "\tconnectionTimeoutMillis: 2000\n";
    text += "});\n";
    text += "\n";
    text += "const client = new Client({\n";
    text += "\thost: \"" + db.host + "\",\n";
    text += "\tport: " + db.port + ",\n";
    text += "\tdatabase: \"" + db.db + "\",\n";
    text += "\tuser: \"" + db.user + "\",\n";
    text += "\tpassword: \"" + db.pass + "\"\n";
    text += "});\n";
    text += "\n";
    text += "/*\n";
    text += "export default (sql: string, params: any[]) => pool.query(sql, params);\n";
    text += "*/\n";
    text += "\n";
    text += "/*\n";
    text += "export default async (sql: string, params: any[]) => {\n";
    text += "\ttry {\n";
    text += "\t\tawait client.connect();\n";
    text += "\t\treturn await client.query(sql, params);\n";
    text += "\t} catch (error: any) {\n";
    text += "\t\tthrow error;\n";
    text += "\t} finally {\n";
    text += "\t\tawait client.end();\n";
    text += "\t}\n"
    text += "}\n";
    text += "*/";
    return text;
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

function createGetTypecast(columns: Column[]): string {
    let text = "";
    text += "function getTypecast(columnName: string): string {\n";
    text += "\tswitch (columnName) {\n";
    const typeColumns = columns.toSorted((a, b) => a.pgType.localeCompare(b.pgType));
    for (let i = 0; i < typeColumns.length; i++) {
        text += "\t\tcase \"" + typeColumns[i].name + "\":\n";
        if (i !== typeColumns.length - 1 && typeColumns[i].pgType === typeColumns[i + 1].pgType)
            continue;
        text += "\t\t\treturn \"::" + typeColumns[i].pgType + "\";\n";
    }
    text += "\t}\n";
    text += "\treturn \"\";\n";
    text += "}"
    return text;
}

function createGet(tableSchema: string, tableName: string, columns: Column[]): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const varName = nameBeautifier(tableName).replaceAll(" ", "")[0].toLowerCase() + nameBeautifier(tableName).replaceAll(" ", "").substring(1);
    const functionName = "get" + nameBeautifier(tableName).replaceAll(" ", "");
    text += "/**\n";
    text += " * Finds and retrieves " + singularize(nameBeautifier(tableName)) + " objects from the database based on specified criteria.\n";
    text += " *\n";
    text += " * @async\n";
    text += " * @function " + functionName + "\n";
    text += " * @param {Partial<" + className + ">} criteria - An object containing properties of the " + className + " to filter by.\n"
    text += " * Only " + nameBeautifier(tableName).toLowerCase() + " matching all provided criteria will be returned.\n"
    text += " * An empty object or undefined criteria will fetch all " + className + " objects.\n"
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning an array of " + nameBeautifier(tableName) + " matching the criteria.\n";
    text += " */\n";
    text += "export async function get" + nameBeautifier(tableName).replaceAll(" ", "") + "(criteria: Partial<" + className + ">): Promise<" + className + "[]> {\n";
    text += "\tconst whereClauses: string[] = [];\n";
    text += "\tconst values: any[] = [];\n";
    text += "\tlet paramIndex = 1;\n";
    text += "\n";
    text += "\tfor (const key in criteria) {\n";
    text += "\t\tif (Object.prototype.hasOwnProperty.call(criteria, key) && criteria[key as keyof typeof criteria] !== undefined) {\n";
    text += "\t\t\twhereClauses.push(\"\\\"\" + key + \"\\\" = $\" + paramIndex + getTypecast(key));\n";
    text += "\t\t\tvalues.push(criteria[key as keyof typeof criteria]);\n";
    text += "\t\t\tparamIndex++;\n";
    text += "\t\t}\n";
    text += "\t}\n";
    text += "\n";
    text += "\tlet sql = \"SELECT * FROM " + tableSchema + "." + tableName + "\";\n";
    text += "\tif (whereClauses.length > 0)\n";
    text += "\t\tsql += \" WHERE \" + whereClauses.join(\" AND \");\n";
    text += "\tsql += \";\";\n";
    text += "\n";
    text += "\tconst " + varName + "Query = await query(sql, values);\n";
    text += arrayMaker(1, varName, className, columns) + "\n";
    text += "\treturn " + varName + ";\n";
    text += "}";
    return text;
}

function createAdd(tableSchema: string, tableName: string, required: Column[], optional: Column[], autoGenerated: Column[], hasForeign: boolean): string {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const paramName = className.slice(0, 1).toLowerCase() + className.slice(1);
    const functionName = "add" + singularize(nameBeautifier(tableName).replaceAll(" ", ""));
    const dataType = "Omit<" + className + ", '" + autoGenerated.concat(optional).map((column) => {
        return column.name
    }).join("\' | \'") + "'>" + (optional.length > 0 ? " & Partial<Pick<" + className + ", '" + optional.map((column) => {
        return column.name
    }).join("\' | \'") + "'>>" : "");
    const editableColumns = required.concat(optional);

    text += "/**\n";
    text += " * Adds a new " + singularize(nameBeautifier(tableName)) + " object to the database.\n";
    if (autoGenerated.length !== 0)
        text += " * The field" + (autoGenerated.length > 1 ? "s" : "") + " `" + autoGenerated.map((column) => {
            return column.name
        }).join("\`, \`") + "` " + (autoGenerated.length > 1 ? "are" : "is") + " auto-generated.\n";
    if (optional.length !== 0)
        text += " * The field" + (optional.length > 1 ? "s" : "") + " `" + optional.map((column) => {
            return column.name
        }).join("`, `") + "` " + (optional.length > 1 ? "are" : "is") + " optional and will use database defaults if not provided.\n";
    text += " *\n";
    text += " * @async\n";
    text += " * @function " + functionName + "\n";
    text += " * @param {" + dataType + "} " + paramName + " - An object containing the data for the new " + className + ".\n";
    if (required.length !== 0)
        text += " * - The " + (required.length > 1 ? "properties" : "property") + " from `" + className + "\` like \`" + required.map((column) => {
            return column.name
        }).join("`, `") + "` " + (required.length > 1 ? "are" : "is") + " required.\n";
    const nullable = editableColumns.filter((column) => column.isNullable);
    if (nullable.length !== 0)
        text += " * - The nullable " + (nullable.length > 1 ? "fields" : "field") + " like \`" + nullable.map((column) => {
            return column.name
        }).join("`, `") + "` can be provided as `null` or " + (nullable.length > 1 ? "their" : "its") + " respective type.\n";
    if (optional.length !== 0)
        text += " * - The field" + (optional.length > 1 ? "s" : "") + " `" + optional.map((column) => {
            return column.name
        }).join("`, `") + "` " + (optional.length > 1 ? "are" : "is") + " optional.\n";
    text += " * @returns {Promise<" + className + ">} A Promise returning the newly created " + className + " object.\n";
    if (hasForeign) {
        text += " * @throws {Error} An exception in the case of the ";
        for (const column of editableColumns)
            if (column.isForeign)
                text += nameBeautifier(column.name) + " or the ";
        text = text.slice(0, -8);
        text += " not existing in their table, or if other pre-insertion validation fails.\n";
    }
    text += " */\n";

    text += "export async function " + functionName + "(" + paramName + ": " + dataType.replaceAll("'", "\"") + "): Promise<" + className + "> {\n";
    if (hasForeign) {
        for (const column of editableColumns) {
            if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
                const name = nameBeautifier(column.name).replaceAll(" ", "");
                if (column.isNullable) {
                    text += "\tif (" + paramName + "." + column.name + " !== undefined && " + paramName + "." + column.name + " !== null) {\n";
                    text += "\t\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "({" + column.foreignColumn + ": " + paramName + "." + column.name + "});\n";
                    text += "\t\tif (verify" + name + ".length === 0)\n";
                    text += "\t\t\tthrow new Error(\"The " + nameBeautifier(column.name) + " provided does not exist.\");\n";
                    text += "\t}\n\n"
                } else {
                    text += "\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "({" + column.foreignColumn + ": " + paramName + "." + column.name + "});\n";
                    text += "\tif (verify" + name + ".length === 0)\n";
                    text += "\t\t\tthrow new Error(\"The " + nameBeautifier(column.name) + " provided does not exist.\");\n\n";
                }
            }
        }
    }
    text += "\tconst intoClauses: string[] = [];\n";
    text += "\tconst valuesClauses:  string[] = [];\n";
    text += "\tconst values: any[] = [];\n";
    text += "\tlet paramIndex = 1;\n";
    text += "\n";
    text += "\tfor (const key in " + paramName + ") {\n";
    text += "\t\tif (Object.prototype.hasOwnProperty.call(" + paramName + ", key)) {\n";
    text += "\t\t\tconst value = " + paramName + "[key as keyof typeof " + paramName + "];\n";
    text += "\t\t\tif (value !== undefined) {\n";
    text += "\t\t\t\tintoClauses.push(\"\\\"\"+ key + \"\\\"\");\n";
    text += "\t\t\t\tvalues.push(value);\n";
    text += "\t\t\t\tvaluesClauses.push(\"$\" + paramIndex + getTypecast(key));\n";
    text += "\t\t\t\tparamIndex++;\n";
    text += "\t\t\t}\n";
    text += "\t\t}\n";
    text += "\t}\n";
    text += "\n";
    text += "\tif (intoClauses.length === 0)\n";
    text += "\t\tthrow new Error(\"No data provided for " + paramName + " creation.\");\n";
    text += "\n";
    text += "\tconst sql = \"INSERT INTO " + tableSchema + "." + tableName + " (\" + intoClauses.join(\", \") + \") VALUES (\" + valuesClauses.join(\", \") + \") RETURNING *;\";\n";
    text += "\tconst insertQuery = await query(sql, values);\n";
    text += "\treturn new " + className + "(\n";
    let columns = editableColumns.concat(autoGenerated);
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

function createUpdate(tableSchema: string, tableName: string, columns: Column[], autoGenerated: Column[], hasForeign: boolean) {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const functionName = "update" + nameBeautifier(tableName).replaceAll(" ", "");
    const criteriaType = "Partial<" + className + ">";
    const updatesType = "Partial<" + (autoGenerated.length !== 0 ? "Omit<" + className + ", '" + autoGenerated.map((column) => {
        return column.name
    }).join("' | '") + "'>" : className) + ">";

    text += "/**\n";
    text += " * Updates existing " + className + " objects in the database based on the specified criteria.\n";
    text += " *\n";
    text += " * @async\n";
    text += " * @function " + functionName + "\n";
    text += " * @param {" + criteriaType + "} criteria - An object defining the conditions for which " + nameBeautifier(tableName) + " to update.\n"
    text += " * An empty object would typically mean updating ALL " + nameBeautifier(tableName) + ", which should be handled with caution or disallowed.\n"
    text += " * @param {" + updatesType + "} updates - An object containing the new values for the fields to be updated.\n"
    text += " * Only fields present in this object will be updated.\n";
    text += " * @returns {Promise<" + className + "[]>} A promise that resolves to an array of the updated " + className + " objects.\n"
    text += " * Returns an empty array if no records matched the criteria or if no rows were updated.\n"
    text += " * @throws {Error} If updates object is empty" + (hasForeign ? ", or if foreign key checks fail for provided update values" : "") + ".\n"
    text += " */\n";

    text += "export async function update" + nameBeautifier(tableName).replaceAll(" ", "") + "(criteria: " + criteriaType.replaceAll("'", "\"") + ", updates: " + updatesType.replaceAll("'", "\"") + "): Promise<" + className + "[]> {\n";
    text += "\tif (Object.keys(updates).length === 0)\n";
    text += "\t\tthrow new Error(\"No update data provided.\");\n";
    text += "\n";
    if (hasForeign) {
        for (const column of columns) {
            if (column.isForeign && column.foreignColumn && column.foreignTable && column.foreignSchema) {
                const name = nameBeautifier(column.name).replaceAll(" ", "");
                if (column.isNullable) {
                    text += "\tif (updates." + column.name + " !== undefined && updates." + column.name + " !== null) {\n";
                } else {
                    text += "\tif (updates." + column.name + " !== undefined) {\n";
                }
                text += "\t\tconst verify" + name + " = await get" + nameBeautifier(column.foreignTable).replaceAll(" ", "") + "({" + column.foreignColumn + ": updates." + column.name + "});\n";
                text += "\t\tif (verify" + name + ".length === 0)\n";
                text += "\t\t\tthrow new Error(\"The " + nameBeautifier(column.name) + " provided does not exist.\");\n";
                text += "\t}\n\n"
            }
        }
    }
    text += "\tconst setClauses: string[] = [];\n";
    text += "\tconst whereClauses: string[] = [];\n"
    text += "\tconst values: any[] = [];\n";
    text += "\tlet paramIndex = 1;\n";
    text += "\n";

    text += "\tfor (const key in updates) {\n";
    text += "\t\tif (Object.prototype.hasOwnProperty.call(updates, key)) {\n";
    text += "\t\t\tconst value = updates[key as keyof typeof updates];\n";
    text += "\t\t\tif (value !== undefined) {\n";
    text += "\t\t\t\tvalues.push(value);\n";
    text += "\t\t\t\tsetClauses.push(\"\\\"\"+ key + \"\\\" = $\" + paramIndex + (value !== null ? getTypecast(key) : \"\"));\n";
    text += "\t\t\t\tparamIndex++;\n";
    text += "\t\t\t}\n";
    text += "\t\t}\n";
    text += "\t}\n";
    text += "\n";
    text += "\tfor (const key in criteria) {\n";
    text += "\t\tif (Object.prototype.hasOwnProperty.call(criteria, key)) {\n";
    text += "\t\t\tconst value = criteria[key as keyof typeof criteria];\n";
    text += "\t\t\tif (value !== undefined) {\n";
    text += "\t\t\t\tvalues.push(value);\n";
    text += "\t\t\t\twhereClauses.push(\"\\\"\"+ key + \"\\\" = $\" + paramIndex + (value !== null ? getTypecast(key) : \"\"));\n";
    text += "\t\t\t\tparamIndex++;\n";
    text += "\t\t\t}\n";
    text += "\t\t}\n";
    text += "\t}\n";
    text += "\n";
    text += "\tlet sql = \"UPDATE " + tableSchema + "." + tableName + " SET \" + setClauses.join(\", \") + (whereClauses.length !== 0 ? \" WHERE \" + whereClauses.join(\" AND \") : \"\") + \" RETURNING *;\";\n";
    text += "\n";
    text += "\tconst updateQuery = await query(sql, values);\n";
    text += arrayMaker(1, "update", className, columns) + "\n";
    text += "\treturn update;\n";
    text += "}";
    return text;
}

function createDelete(tableSchema: string, tableName: string, columns: Column[]) {
    let text = "";
    const className = singularize(nameBeautifier(tableName)).replaceAll(" ", "");
    const functionName = "delete" + nameBeautifier(tableName).replaceAll(" ", "");
    text += "/**\n";
    text += " * Deletes the " + className + " records from the database based on specified criteria.\n";
    text += " *\n";
    text += " * @async\n";
    text += " * @function " + functionName + "\n";
    text += " * @param {Partial<" + className + ">} criteria - An object containing properties of the " + className + " to filter by for deletion.\n";
    text += " * An empty object would typically mean deleting ALL " + nameBeautifier(tableName) + ", which should be handled with caution or disallowed.\n"
    text += " * Only accounts matching all provided criteria will be deleted.\n";
    text += " * @returns {Promise<" + className + "[]>} - A Promise object returning the deleted " + nameBeautifier(tableName) + ".\n";
    text += " */\n";
    text += "export async function " + functionName + "(criteria : Partial<" + className + ">): Promise<" + className + "[]> {\n";
    text += "\tconst whereClauses: string[] = [];\n";
    text += "\tconst values: any[] = [];\n";
    text += "\tlet paramIndex = 1;\n";
    text += "\tfor (const key in criteria) {\n";
    text += "\t\tif (Object.prototype.hasOwnProperty.call(criteria, key)) {\n";
    text += "\t\t\tconst value = criteria[key as keyof typeof criteria];\n";
    text += "\t\t\tif (value !== undefined) {\n";
    text += "\t\t\t\tvalues.push(value);\n";
    text += "\t\t\t\twhereClauses.push(\"\\\"\"+ key + \"\\\" = $\" + paramIndex + (value !== null ? getTypecast(key) : \"\"));\n";
    text += "\t\t\t\tparamIndex++;\n";
    text += "\t\t\t}\n";
    text += "\t\t}\n";
    text += "\t}\n";
    text += "\n";
    text += "\tlet sql = \"DELETE FROM " + tableSchema + "." + tableName + "\" + (whereClauses.length !== 0 ? \" WHERE \" + whereClauses.join(\" AND \") : \"\") + \" RETURNING *;\";\n";
    text += "\n";
    text += "\tconst removeQuery = await query(sql, values);\n";
    text += arrayMaker(1, "remove", className, columns) + "\n";
    text += "\treturn remove;\n";
    text += "}";
    return text;
}