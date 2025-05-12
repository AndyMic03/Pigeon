# pigeon

Pigeon is a TypeScript-based tool for generating TypeScript classes and methods from PostgreSQL database schemas. It
simplifies the process of interacting with your database by generating boilerplate code for you.

## Install

Install with [npm](https://www.npmjs.com):

    npm install --save-dev @andymic/pigeon

## Usage

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

### Programmatic Usage

You can also use Pigeon programmatically in your TypeScript code.

```typescript
import {runPigeon} from '@andymic/pigeon';

const result = await runPigeon('output/directory', 'localhost', 5432, 'database', 'username', 'password');
console.log(result.message);
```

### pgAdmin ERD

Pigeon supports generating code from pgAdmin ERD files. To do that the necessary `--pgAdmin` flag needs to point to the
ERD file.

The `--offline` flag prevents any contact with the database. A side effect of that is that the enum labels cannot be
populated.

## Configuration

Pigeon requires a configuration file `.pigeon.json` to connect to your PostgreSQL database. You can generate this file
using the `--init` option.

```json
{
  "host": "localhost",
  "port": 5432,
  "database": "postgres",
  "username": "postgres",
  "password": "xxx"
}
```

## License

This project is licensed under the Apache 2.0 License.