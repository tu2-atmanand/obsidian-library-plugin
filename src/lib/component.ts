import { Component } from 'obsidian';

import LibraryPlugin from 'main';


export class PDFPlusComponent extends Component {
    plugin: LibraryPlugin;

    constructor(plugin: LibraryPlugin) {
        super();
        this.plugin = plugin;
    }

    get app() {
        return this.plugin.app;
    }

    get lib() {
        return this.plugin.lib;
    }

    get settings() {
        return this.plugin.settings;
    }
}
