/**
 * Start dragging an PDF outline item, thumbnail image, or annotation popup to 
 * get ready to create a link to the heading in the markdown file.
 * 
 * See `src/patchers/clilpboard-manager.ts` for the drop handler.
 */
import { Notice, TFile } from 'obsidian';

import PDFPlus from 'main';
import { toSingleLine } from 'utils';
import { PDFOutlineTreeNode, PDFOutlineViewer, PDFViewerChild } from 'typings';
import { PDFOutlines } from 'lib/outlines';


export const registerOutlineDrag = async (plugin: PDFPlus, pdfOutlineViewer: PDFOutlineViewer, child: PDFViewerChild, file: TFile) => {
    const { app, lib } = plugin;
    const promises: Promise<void>[] = [];

    for (const item of pdfOutlineViewer.allItems) {
        promises.push((async () => {
            const textGenerator = await lib.copyLink.getTextToCopyForOutlineItemDynamic(child, file, item);

            const itemTitle = toSingleLine(item.item.title);
            const title = itemTitle
                ? `${itemTitle.length <= 40 ? itemTitle : itemTitle.slice(0, 39).trim() + '…'}`
                : 'PDF section';

            app.dragManager.handleDrag(item.selfEl, (evt) => {
                app.dragManager.updateSource([item.selfEl], 'is-being-dragged');
                return {
                    source: 'pdf-plus',
                    type: 'pdf-offset',
                    icon: 'lucide-heading',
                    title,
                    getText: textGenerator,
                    item
                }
            });

            app.dragManager.handleDrop(item.selfEl, (evt, draggable, dragging) => {
                if (!plugin.settings.enalbeWriteHighlightToFile) return;

                // @ts-ignore
                let draggedItem = draggable.item as PDFOutlineTreeNode | undefined;

                if (draggedItem) {
                    if (!dragging) {
                        (async () => {
                            const outlines = await PDFOutlines.fromChild(child, plugin);
                            const [destItem, itemToMove] = await Promise.all([
                                outlines?.findPDFjsOutlineTreeNode(item),    
                                outlines?.findPDFjsOutlineTreeNode(draggedItem)
                            ]);

                            if (!outlines || !destItem || !itemToMove) {
                                new Notice(`${plugin.manifest.name}: Failed to move the outline item.`);
                                return;
                            }

                            destItem.appendChild(itemToMove);
                            const buffer = await outlines.doc.save();
                            await app.vault.modifyBinary(file, buffer);
                        })();
                    }

                    return {
                        action: `Move into "${title}"`,
                        dropEffect: 'move',
                        hoverEl: item.el,
                        hoverClass: 'is-being-dragged-over',
                    }
                }
            }, false);
        })())
    }

    await Promise.all(promises);
}

export const registerThumbnailDrag = (plugin: PDFPlus, child: PDFViewerChild, file: TFile) => {
    const { app, lib } = plugin;

    child.pdfViewer.pdfThumbnailViewer.container
        .querySelectorAll<HTMLElement>('div.thumbnail[data-page-number]')
        .forEach((div) => {
            const pageNumber = parseInt(div.dataset.pageNumber!);
            const pageView = child.getPage(pageNumber);
            const pageLabel = pageView.pageLabel ?? ('' + pageNumber);
            const pageCount = child.pdfViewer.pagesCount;
            const title = ('' + pageNumber === pageLabel)
                ? `Page ${pageNumber}`
                : `Page ${pageLabel} (${pageNumber}/${pageCount})`;

            app.dragManager.handleDrag(div, (evt) => {
                app.dragManager.updateSource([div], 'is-being-dragged');
                return {
                    source: 'pdf-plus',
                    type: 'pdf-page',
                    icon: 'lucide-book-open',
                    title,
                    getText: (sourcePath: string) => {
                        return lib.copyLink.getTextToCopy(
                            child,
                            plugin.settings.thumbnailLinkCopyFormat,
                            plugin.settings.thumbnailLinkDisplayTextFormat,
                            file, pageNumber, `#page=${pageNumber}`, '', '', sourcePath
                        );
                    }
                }
            });

        });
}

export const registerAnnotationPopupDrag = (plugin: PDFPlus, popupEl: HTMLElement, child: PDFViewerChild, file: TFile, page: number, id: string) => {
    const { app, lib } = plugin;

    const pageView = child.getPage(page);

    child.getAnnotatedText(pageView, id)
        .then((text): void => {
            app.dragManager.handleDrag(popupEl, (evt) => {
                app.dragManager.updateSource([popupEl], 'is-being-dragged');
                const palette = lib.getColorPaletteFromChild(child);
                if (!palette) return null;
                const template = plugin.settings.copyCommands[palette.actionIndex].template;

                return {
                    source: 'pdf-plus',
                    type: 'pdf-annotation',
                    icon: 'lucide-highlighter',
                    title: 'PDF annotation',
                    getText: (sourcePath: string) => {
                        return lib.copyLink.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, '', sourcePath);
                    }
                }
            });
        });
}
