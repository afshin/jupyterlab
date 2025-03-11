// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig } from '@jupyterlab/coreutils';

import { Token } from '@lumino/coreutils';

import { JupyterFrontEnd, JupyterFrontEndPlugin } from '.';

export namespace ISecretRegistry {
  export type PluginFactory<T> = (token: symbol) => JupyterFrontEndPlugin<T>;

  export interface ISecrets {
    plugin: string;
    keys: string[];
    values: string[];
  }
}

export interface ISecretRegistry {
  get(token: symbol): Promise<ISecretRegistry.ISecrets>;
}

export class SecretRegistry {
  constructor(protected readonly app: JupyterFrontEnd) {}

  async get(token: symbol): Promise<ISecretRegistry.ISecrets> {
    const { lock, locked, plugins } = Private;
    const { isDisabled } = PageConfig.Extension;
    if (locked) {
      throw new Error('Secret registry is locked, check errors.');
    }
    if (isDisabled(SecretRegistry.EXTENSION)) {
      lock(`Secret registry is disabled.`);
    }
    if (!this.app.hasPlugin(SecretRegistry.EXTENSION)) {
      lock(`Secret registry extension is not registered.`);
    }
    const plugin = plugins.get(token);
    if (plugin === undefined) {
      lock(`Secret fetch error: token is invalid.`);
    }
    if (isDisabled(plugin!)) {
      lock(`Secret fetch error: plugin ${plugin} is disabled.`);
    }
    if (!this.app.hasPlugin(plugin!)) {
      lock(`Plugin ${plugin} is not registered.`);
    }
    // TODO: Use a data connector to fetch values.
    return { keys: ['foo'], plugin: plugin!, values: ['bar'] };
  }
}

export namespace SecretRegistry {
  export const EXTENSION = '@jupyterlab/application:secret-registry';

  export function sign<T>(
    id: string,
    factory: ISecretRegistry.PluginFactory<T>
  ): JupyterFrontEndPlugin<T> {
    const { lock, locked, plugins, symbols } = Private;
    const { isDisabled } = PageConfig.Extension;
    if (locked) {
      throw new Error(`Secret registry is locked, check errors.`);
    }
    if (isDisabled(EXTENSION)) {
      lock(`Secret registry is disabled.`);
    }
    if (isDisabled(id)) {
      lock(`Sign error: plugin ${id} is disabled.`);
    }
    const token = Symbol(id);
    const plugin = factory(token);
    if (id !== plugin.id) {
      lock(`Sign error: plugin ID mismatch "${plugin.id}"≠"${id}".`);
    }
    if (symbols.has(id)) {
      lock(`Sign error: another plugin signed as "${plugin.id}".`);
    }
    plugins.set(token, id);
    symbols.set(id, token);
    return plugin;
  }
}

export const ISecretRegistry = new Token<ISecretRegistry>(
  SecretRegistry.EXTENSION
);

namespace Private {
  export let locked = false;

  export const plugins = new Map<symbol, string>();

  export const symbols = new Map<string, symbol>();

  export function lock(message: string) {
    locked = true;
    throw new Error(message);
  }
}
