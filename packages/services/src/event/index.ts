// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { URLExt } from '@jupyterlab/coreutils';
import { JSONObject, ReadonlyJSONObject } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { Poll } from '@lumino/polling';
import { IStream, Signal, Stream } from '@lumino/signaling';
import { ServerConnection } from '../serverconnection';

/**
 * The url for the jupyter-server events service.
 */
const SERVICE_EVENTS_URL = 'api/events';

/**
 * The events API service manager.
 */
export class EventManager implements Event.IManager {
  /**
   * Create a new event manager.
   */
  constructor(options: EventManager.IOptions = {}) {
    this.serverSettings =
      options.serverSettings ?? ServerConnection.makeSettings();
    const { appendToken, token, WebSocket, wsUrl } = this.serverSettings;
    let url = URLExt.join(wsUrl, SERVICE_EVENTS_URL, 'subscribe');
    if (appendToken && token !== '') {
      url += `?token=${encodeURIComponent(token)}`;
    }
    this._stream = new Private.SocketStream(this, { url, WebSocket });
  }

  /**
   * The server settings used to make API requests.
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * Whether the event manager is disposed.
   */
  get isDisposed(): boolean {
    return this._stream.isDisposed;
  }

  /**
   * An event stream that emits and yields each new event.
   */
  get stream(): Event.Stream {
    return this._stream;
  }

  /**
   * Dispose the event manager.
   */
  dispose(): void {
    this._stream.dispose();
  }

  /**
   * Post an event request to be emitted by the event bus.
   */
  async emit(event: Event.Request): Promise<void> {
    const { serverSettings } = this;
    const { baseUrl } = serverSettings;
    const { makeRequest, ResponseError } = ServerConnection;
    const url = URLExt.join(baseUrl, SERVICE_EVENTS_URL);
    const init = { body: JSON.stringify(event), method: 'POST' };
    const response = await makeRequest(url, init, serverSettings);

    if (response.status !== 204) {
      throw new ResponseError(response);
    }
  }

  private _stream: Private.SocketStream<this, Event.Emission>;
}

/**
 * A namespace for `EventManager` statics.
 */
export namespace EventManager {
  /**
   * The instantiation options for an event manager.
   */
  export interface IOptions {
    /**
     * The server settings used to make API requests.
     */
    serverSettings?: ServerConnection.ISettings;
  }
}

/**
 * A namespace for event API interfaces.
 */
export namespace Event {
  /**
   * The event emission type.
   */
  export type Emission = ReadonlyJSONObject & {
    schema_id: string;
  };

  /**
   * The event request type.
   */
  export type Request = {
    data: JSONObject;
    schema_id: string;
    version: string;
  };

  /**
   * An event stream with the characteristics of a signal and an async iterator.
   */
  export type Stream = IStream<IManager, Emission>;

  /**
   * The interface for the event bus front-end.
   */
  export interface IManager extends IDisposable {
    /**
     * The server settings used to make API requests.
     */
    readonly serverSettings: ServerConnection.ISettings;
    /**
     * An event stream that emits and yields each new event.
     */
    readonly stream: Event.Stream;
    /**
     * Post an event request to be emitted by the event bus.
     */
    emit(event: Event.Request): Promise<void>;
  }
}

namespace Private {
  export class SocketStream<T, U> extends Stream<T, U> implements IDisposable {
    constructor(sender: T, options: SocketStream.IOptions) {
      super(sender);
      this.options = options;
      this.subscription = new Poll({ factory: () => this.subscribe() });
    }

    get isDisposed() {
      return this.subscription.isDisposed;
    }

    dispose() {
      super.stop();
      this.subscription.dispose();
      const { socket } = this;
      if (socket) {
        this.socket = null;
        socket.onclose = () => undefined;
        socket.onerror = () => undefined;
        socket.onmessage = () => undefined;
        socket.onopen = () => undefined;
        socket.close();
      }
      Signal.clearData(this);
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      this.socket?.send(data);
    }

    protected readonly subscription: Poll;

    protected readonly options: SocketStream.IOptions;

    protected socket: WebSocket | null = null;

    protected async subscribe(): Promise<void> {
      if (this.isDisposed) {
        return;
      }
      return new Promise<void>((_, reject) => {
        const { url, WebSocket } = this.options;
        const socket = (this.socket = new WebSocket(url));
        socket.onclose = () => reject(new Error('socket closed'));
        socket.onmessage = msg => msg.data && this.emit(JSON.parse(msg.data));
      });
    }
  }

  export namespace SocketStream {
    export interface IOptions {
      url: string;
      WebSocket: typeof WebSocket;
    }
  }
}
