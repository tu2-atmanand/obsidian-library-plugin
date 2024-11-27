import { Component, Modal } from 'obsidian';

import LibraryPlugin from 'main';
import { PDFPlusLib } from 'lib';


export class PDFPlusModal extends Modal {
    plugin: LibraryPlugin;
    lib: PDFPlusLib;
    component: Component;

    constructor(plugin: LibraryPlugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.lib = plugin.lib;
        this.component = new Component();
        this.contentEl.addClass('pdf-plus-modal');
    }

    onOpen() {
        this.component.load();
    }

    onClose() {
        this.contentEl.empty();
        this.component.unload();
    }
}
