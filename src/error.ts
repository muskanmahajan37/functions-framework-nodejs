// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as http from 'http';
import {sendCrashResponse} from './logger';
import {Response} from './invoker';

// Use an exit code which is unused by Node.js:
// https://nodejs.org/api/process.html#process_exit_codes
const killInstance = process.exit.bind(process, 16);

/**
 * Enables registration of error handlers.
 * @param server HTTP server which invokes user's function.
 * @constructor
 */
export class FunctionsFrameworkErrorHandler {
  private static customeErrorHandlers:  [string, Function][] = [];

  /**
   * Registers handlers for uncaught exceptions and other unhandled errors.
   */
  static register(server: http.Server) {
    process.on('uncaughtException', async err => {
      console.error('Uncaught exception');
      await callCustomErrorHandler('uncaughtException');
      sendCrashResponse({err, res: Response.latest, callback: killInstance});
    });

    process.on('unhandledRejection', async err => {
      console.error('Unhandled rejection');
      await callCustomErrorHandler('unhandledRejection');
      sendCrashResponse({err, res: Response.latest, callback: killInstance});
    });

    process.on('exit', async code => {
      await callCustomErrorHandler('exit');
      sendCrashResponse({
        err: new Error(`Process exited with code ${code}`),
        res: Response.latest,
        silent: code === 0,
      });
    });

    ['SIGINT', 'SIGTERM'].forEach(signal => {
      process.on(signal as NodeJS.Signals, async () => {
        console.log(`Received ${signal}`);
        await callCustomErrorHandler(signal);
        server.close(() => {
          // eslint-disable-next-line no-process-exit
          process.exit();
        });
      });
    });

    /**
     * Calls all custom error handlers with a certain syntal.
     * Await for all responses.
     * @param signal The signal to call error handlers for.
     * @return A list of promises for async error handlers.
     */
    const callCustomErrorHandler = async (signal: string) => {
      // Loop through every custom error handler
      const errorPromises = this.customeErrorHandlers.map(async ([
        errorHandlerSignal,
        errorHandlerFunction
      ]) => {
        // If this error handler is listening to this signal
        if (signal === errorHandlerSignal) {
          // Call the custom error handler. Await response.
          await errorHandlerFunction(signal);
        }
      });
      return Promise.all(errorPromises);
    }
  }

  /**
   * Registers a custom error handler.
   */
  static on(error: string, listener: NodeJS.SignalsListener) {
    FunctionsFrameworkErrorHandler.customeErrorHandlers.push([error, listener]);
  }
}
