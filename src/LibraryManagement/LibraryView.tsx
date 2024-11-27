// /src/LibraryManagement/LibraryView.tsx

import { App, ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";

import { LibraryIcon } from "globals";
import LibraryPlugin from "main";
import LibraryViewBody from "./components/LibraryViewBody";
import { StrictMode } from "react";

export class LibraryView extends ItemView {
	static VIEW_TYPE = "library-view";
	root: Root | null = null;
	plugin: LibraryPlugin;

	constructor(app: App, plugin: LibraryPlugin, leaf: WorkspaceLeaf) {
		super(leaf);
		this.app = app;
		this.plugin = plugin;
		this.icon = LibraryIcon;
	}

	getViewType() {
		return LibraryView.VIEW_TYPE;
	}

	getDisplayText() {
		return "Library";
	}

	async onOpen() {
		this.renderBoard();
	}

	private renderBoard() {
		this.root = createRoot(this.containerEl.children[1]);
		this.root.render(
			<StrictMode>
				<LibraryViewBody plugin={this.plugin} />
			</StrictMode>
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}
