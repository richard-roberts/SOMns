'use strict';

const debuggerPort = 7977;
const somBasepath = '../../';
const som = somBasepath + 'som';

import * as WebSocket from 'ws';
import { expect } from 'chai';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import * as fs from 'fs';


interface SomConnection {
  somProc: ChildProcess;
  socket:  WebSocket;
}

interface OnMessageEvent {
  data:   any;
  type:   string;
  target: WebSocket
}

interface OnMessageHandler {
  (event: OnMessageEvent): void
}

interface Message {
  type: string;
}

interface Source {
  id:         string;
  sourceText: string;
  mimeType:   string;
  name:       string;
  uri:        string;
}

interface SourceMap {
  [key: string]: Source;
}

interface SourceMessage extends Message {
  sources: SourceMap;
  sections: any; // TODO
  methods:  any; // TODO
}

interface Respond {
  action: string;
}

interface Breakpoint {
}

interface InitialBreakpointsResponds extends Respond {
  breakpoints: Breakpoint[];
}

function getInitialBreakpointsResponds(breakpoints: Breakpoint[]): string {
  return JSON.stringify({action: "initialBreakpoints", breakpoints});
}

function startSomAndConnect(onMessageHandler?: OnMessageHandler,
    initialBreakpoints?: Breakpoint[]): Promise<SomConnection> {
  const somProc = spawn(som, ['-G', '-t1', '-wd', 'tests/pingpong.som']);
  const promise = new Promise((resolve, reject) => {
    let connecting = false;
    somProc.stdout.on('data', (data) => {
      if (data.toString().includes("Started HTTP Server") && !connecting) {
        connecting = true;
        const socket = new WebSocket('ws://localhost:' + debuggerPort);
        socket.on('open', () => {
          if (initialBreakpoints) {
            socket.send(getInitialBreakpointsResponds(initialBreakpoints));
          }

          resolve({somProc: somProc, socket: socket});
        });
        if (onMessageHandler) {
          socket.onmessage = onMessageHandler;
        }
      }
      if (data.toString().includes("Failed starting WebSocket and/or HTTP Server")) {
        reject(new Error('SOMns failed to starting WebSocket and/or HTTP Server'));
      }
    });
  });
  return promise;
}

let connectionPossible = false;
function onlyWithConection(fn: ActionFunction) {
  return function(done) {
    if (connectionPossible) {
      fn(done);
    } else {
      this.skip();
    }
  }
}

describe('Basic Project Setup', () => {
  describe('SOMns is testable', () => {
    it('SOMns executable should be in somBasepath', (done) => {
      fs.access(som, fs.X_OK, (err) => {
        expect(err).to.be.null;
        done();
      })
    });

    it('should show help', done => {
      let sawOutput = false;
      const somProc = spawn(som, ['-h']);
      somProc.stdout.on('data', (data) => { sawOutput = true; });
      somProc.on('exit', (code) => {
        expect(sawOutput).to.be.true;
        expect(code).to.equal(0);
        done();
      });
    });

    it('should be possible to connect', done => {
      const connectionP = startSomAndConnect();
      connectionP.then(connection => {
        connection.somProc.kill();
        connection.somProc.on('exit', code => {
          // wait until process is shut down, to make sure all ports are closed
          done();
        });
        connectionPossible = true;
      });
      connectionP.catch(reason => {
        done(reason);
      })
    })
  });
});

describe('Basic Protocol', function() {
  let connectionP : Promise<SomConnection> = null;

  afterEach(() => {
    connectionP.then(c => c.somProc.kill());
  });

  describe('source information format', () => {
    // Capture first source message for testing
    let firstSourceCaptured = false;
    let getSourceData: (event: OnMessageEvent) => void;
    let sourceP = new Promise<SourceMessage>((resolve, reject) => {
      getSourceData = (event: OnMessageEvent) => {
        // console.log(event);
        if (firstSourceCaptured) { return; }    
        const data = JSON.parse(event.data);
        if (data.type == "source") {
          firstSourceCaptured = true;
          resolve(data);
        }
      }
    });

    before('Start SOMns and Connect', () => {
      connectionP = startSomAndConnect(getSourceData, []);
    });

    it('should have the expected fields and data', onlyWithConection(done => {
      sourceP.then(sourceMsg => {
        for (let sourceId in sourceMsg.sources) {
          try {
            expect(sourceId).to.equal("s-0");
            const source = sourceMsg.sources[sourceId];
            expect(source.mimeType).to.equal("application/x-newspeak-som-ns");
            expect(source.name).to.equal("Platform.som");
            expect(source).to.have.property('sourceText');
            expect(source).to.have.property('uri');
            done();
          } catch (e) {
            done(e);
          }
        }
      });
    }));
  });

  describe('setting breakpoints', () => {
    it('should accept line breakpoint format, and halt on expected line');
    it('should accept source section breakpoint format (sender), and halt on eventual send');
    it('suspended event should have expected structure and data');
    it('should accept source section breakpoint format (receiver), and halt at expected method');
    it('should accept source section breakpoint format (promise), and halt at resolution');
  });

  describe('stepping', () => {
    it('should be possible to do single stepping with line breakpoints');
    it('should be possible to do single stepping with source section breakpoints');

    it('should be possible to do continue execution');
  });
});
