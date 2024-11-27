import { App } from 'obsidian';

import LibraryPlugin from 'main';
import { PDFPlusLib } from 'lib';
import { PDFPlusSettings } from 'settings';


export class PDFPlusLibSubmodule {
    app: App;
    plugin: LibraryPlugin;

    constructor(plugin: LibraryPlugin) {
        this.app = plugin.app;
        this.plugin = plugin;
    }

    get lib(): PDFPlusLib {
        return this.plugin.lib;
    }

    get settings(): PDFPlusSettings {
        return this.plugin.settings;
    }
}
