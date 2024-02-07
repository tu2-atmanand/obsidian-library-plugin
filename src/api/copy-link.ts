import { Editor, MarkdownFileInfo, MarkdownView, Notice, TFile } from 'obsidian';

import { PDFPlusAPISubmodule } from './submodule';
import { PDFPlusTemplateProcessor } from 'template';
import { encodeLinktext, paramsToSubpath, toSingleLine } from 'utils';
import { PDFOutlineTreeNode, PDFViewerChild } from 'typings';


export class copyLinkAPI extends PDFPlusAPISubmodule {
    statusDurationMs = 2000;

    getTemplateVariables(subpathParams: Record<string, any>) {
        const selection = activeWindow.getSelection();
        if (!selection) return null;
        const pageEl = this.api.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;

        const viewerEl = pageEl.closest<HTMLElement>('.pdf-viewer');
        if (!viewerEl) return null;

        const child = this.plugin.pdfViwerChildren.get(viewerEl);
        const file = child?.file;
        if (!file) return null;

        let page = +pageEl.dataset.pageNumber;
        // if there is no selected text, read the current page number from the viewer, not from the selection
        if (!selection.toString()) {
            page = child.pdfViewer.pdfViewer?.currentPageNumber ?? page;
        }

        const subpath = paramsToSubpath({
            page,
            selection: child.getTextSelectionRangeStr(pageEl),
            ...subpathParams
        });

        return {
            child,
            file,
            subpath,
            page,
            pageCount: child.pdfViewer.pagesCount,
            pageLabel: child.getPage(page).pageLabel ?? ('' + page),
            text: toSingleLine(selection.toString()),
        };
    }

    getLinkTemplateVariables(child: PDFViewerChild, displayTextFormat: string | undefined, file: TFile, subpath: string, page: number, text: string, sourcePath?: string) {
        sourcePath = sourcePath ?? '';
        const link = this.app.fileManager.generateMarkdownLink(file, sourcePath, subpath).slice(1);
        let linktext = this.app.metadataCache.fileToLinktext(file, sourcePath) + subpath;
        if (this.app.vault.getConfig('useMarkdownLinks')) {
            linktext = encodeLinktext(linktext);
        }
        const display = this.getDisplayText(child, displayTextFormat, file, page, text);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkWithDisplay = app.fileManager.generateMarkdownLink(file, sourcePath, subpath, display).slice(1);
        const linkWithDisplay = this.api.generateMarkdownLink(file, sourcePath, subpath, display).slice(1);

        const linkToPage = this.app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`).slice(1);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkToPageWithDisplay = app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`, display).slice(1);
        const linkToPageWithDisplay = this.api.generateMarkdownLink(file, sourcePath, `#page=${page}`, display).slice(1);

        return {
            link,
            linktext,
            display,
            linkWithDisplay,
            linkToPage,
            linkToPageWithDisplay
        };
    }

    getDisplayText(child: PDFViewerChild, displayTextFormat: string | undefined, file: TFile, page: number, text: string) {
        if (!displayTextFormat) {
            // read display text format from color palette
            const palette = this.api.getColorPaletteFromChild(child);
            if (palette) {
                displayTextFormat = this.settings.displayTextFormats[palette.displayTextFormatIndex].template;
            } else {
                displayTextFormat = this.settings.displayTextFormats[this.settings.defaultDisplayTextFormatIndex].template;
            }
        }

        try {
            return new PDFPlusTemplateProcessor(this.plugin, {
                file,
                page,
                pageCount: child.pdfViewer.pagesCount,
                pageLabel: child.getPage(page).pageLabel ?? ('' + page),
                text
            }).evalTemplate(displayTextFormat)
                .trim();
        } catch (err) {
            console.error(err);
            new Notice(`${this.plugin.manifest.name}: Display text format is invalid. Error: ${err.message}`, 3000);
        }
    }

    getTextToCopy(child: PDFViewerChild, template: string, displayTextFormat: string | undefined, file: TFile, page: number, subpath: string, text: string, colorName: string, sourcePath?: string) {
        const pageView = child.getPage(page);

        const processor = new PDFPlusTemplateProcessor(this.plugin, {
            file,
            page,
            pageLabel: pageView.pageLabel ?? ('' + page),
            pageCount: child.pdfViewer.pagesCount,
            text,
            colorName,
            calloutType: this.settings.calloutType,
            ...this.api.copyLink.getLinkTemplateVariables(child, displayTextFormat, file, subpath, page, text, sourcePath)
        });

        const evaluated = processor.evalTemplate(template);
        return evaluated;
    }

    async getTextToCopyForOutlineItem(child: PDFViewerChild, file: TFile, item: PDFOutlineTreeNode, sourcePath?: string) {
        return (await this.getTextToCopyForOutlineItemDynamic(child, file, item))(sourcePath);
    }

    async getTextToCopyForOutlineItemDynamic(child: PDFViewerChild, file: TFile, item: PDFOutlineTreeNode) {
        const dest = await item.getExplicitDestination();
        const pageNumber = await item.getPageNumber();
        const destArray = this.api.normalizePDFjsDestArray(pageNumber, dest);
        const subpath = this.api.destArrayToSubpath(destArray);

        return (sourcePath?: string) => this.getTextToCopy(
            child,
            this.settings.outlineLinkCopyFormat,
            this.settings.outlineLinkDisplayTextFormat,
            file, pageNumber, subpath, item.item.title, '', sourcePath
        );
    }

    copyLinkToSelection(checking: boolean, template: string, colorName?: string, autoPaste?: boolean): boolean {
        const variables = this.getTemplateVariables(colorName ? { color: colorName.toLowerCase() } : {});

        if (variables) {
            const { child, file, subpath, page, text } = variables;

            if (!text) return false;

            if (!checking) {
                const evaluated = this.getTextToCopy(child, template, undefined, file, page, subpath, text, colorName?.toLowerCase() ?? '');
                navigator.clipboard.writeText(evaluated);
                this.onCopyFinish(evaluated);

                const palette = this.api.getColorPaletteFromChild(child);
                palette?.setStatus('Link copied', this.statusDurationMs);
                if (autoPaste) {
                    this.autoPaste(evaluated).then((success) => {
                        if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                    });
                }
            }

            return true;
        }

        return false;
    }

    copyLinkToAnnotation(child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, autoPaste?: boolean, shouldShowStatus?: boolean): boolean {
        const file = child.file;
        if (!file) return false;

        if (!checking) {
            const pageView = child.getPage(page);
            child.getAnnotatedText(pageView, id)
                .then((text) => {
                    const evaluated = this.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, '');
                    navigator.clipboard.writeText(evaluated);
                    this.onCopyFinish(evaluated);

                    const palette = this.api.getColorPaletteFromChild(child);
                    // This can be redundant because the copy button already shows the status.
                    if (shouldShowStatus) palette?.setStatus('Link copied', this.statusDurationMs);
                    if (autoPaste) {
                        this.autoPaste(evaluated).then((success) => {
                            if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                        });
                    }
                });
        }

        return true;
    }

    copyLinkToAnnotationWithGivenTextAndFile(text: string, file: TFile, child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, colorName: string, autoPaste?: boolean) {
        if (!checking) {
            const evaluated = this.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, colorName)
            navigator.clipboard.writeText(evaluated);
            this.onCopyFinish(evaluated);

            const palette = this.api.getColorPaletteFromChild(child);
            palette?.setStatus('Link copied', this.statusDurationMs);
            if (autoPaste) {
                this.autoPaste(evaluated).then((success) => {
                    if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                });
            }
        }

        return true;
    }

    // TODO: A better, more concise function name 😅
    writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, template: string, colorName?: string, autoPaste?: boolean): boolean {
        // Get and store the selected text before writing file because
        // the file modification will cause the PDF viewer to be reloaded,
        // which will clear the selection.
        const selection = activeWindow.getSelection();
        if (!selection) return false;
        const text = toSingleLine(selection.toString());
        if (!text) return false;

        if (!checking) {
            const palette = this.api.getColorPaletteAssociatedWithSelection();
            palette?.setStatus('Writing highlight annotation into file...', 10000);
            this.api.highlight.writeFile.addHighlightAnnotationToSelection(colorName)
                .then((result) => {
                    if (!result) return;

                    const { child, file, page, annotationID } = result;
                    if (!annotationID || !file) return;

                    setTimeout(() => {
                        // After the file modification, the PDF viewer DOM is reloaded, so we need to 
                        // get the new DOM to access the newly loaded color palette instance.
                        const newPalette = this.api.getColorPaletteFromChild(child);
                        newPalette?.setStatus('Link copied', this.statusDurationMs);
                        this.copyLinkToAnnotationWithGivenTextAndFile(text, file, child, false, template, page, annotationID, colorName?.toLowerCase() ?? '', autoPaste);
                    }, 300);
                })
        }

        return true;
    }

    async autoPaste(text: string): Promise<boolean> {
        if (this.plugin.lastPasteFile && this.plugin.lastPasteFile.extension === 'md') {
            const lastPasteFile = this.plugin.lastPasteFile;
            const isLastPasteFileOpened = this.api.workspace.isMarkdownFileOpened(lastPasteFile);

            // Use vault, not editor, so that we can auto-paste even when the file is not opened
            await this.app.vault.process(this.plugin.lastPasteFile, (data) => {
                // If the file does not end with a blank line, add one
                data = data.trimEnd()
                if (data) data += '\n\n';
                data += text;
                return data;
            });

            if (this.plugin.settings.focusEditorAfterAutoPaste && isLastPasteFileOpened) {
                // If the file opened in some tab, focus the tab and move the cursor to the end of the file.
                // To this end, we listen to the editor-change event so that we can detect when the editor update
                // triggered by the auto-paste is done.
                const eventRef = this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                    if (info.file?.path === lastPasteFile.path) {
                        this.app.workspace.offref(eventRef);

                        if (info instanceof MarkdownView) {
                            this.app.workspace.revealLeaf(info.leaf);
                        }

                        if (!editor.hasFocus()) editor.focus();
                        editor.exec('goEnd');
                    }
                });

                this.plugin.registerEvent(eventRef);
            }

            return true;
        }

        new Notice(`${this.plugin.manifest.name}: Cannot auto-paste because this is the first time. Please manually paste the link.`)
        return false;
    }

    watchPaste(text: string) {
        // watch for a manual paste for updating this.lastPasteFile
        this.plugin.registerOneTimeEvent(this.app.workspace, 'editor-paste', (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
            if (info.file?.extension === 'md' && evt.clipboardData?.getData('text/plain') === text) {
                this.plugin.lastPasteFile = info.file;
            }
        });
    }

    onCopyFinish(text: string) {
        this.watchPaste(text);
        // update this.lastCopiedDestArray
        this.plugin.lastCopiedDestInfo = null;
    }
}
