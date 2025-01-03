import { Platform, TFile, normalizePath } from "obsidian";
import { useEffect, useState } from "react";

import LibraryPlugin from "main";

interface BookCardProps {
	plugin: LibraryPlugin;
	cardKey: number;
	file: TFile;
}

export const BookCard: React.FC<BookCardProps> = ({ plugin, cardKey, file }) => {
	const [thumbnail, setThumbnail] = useState<string | null>(null);

	useEffect(() => {
		const generateThumbnail = async () => {
			if (file.path.endsWith(".pdf")) {

				// Using the below binData method, the pdf loads faster as well as the thumnails are loaded faster. But When I am using the above method of fetching PDFs from outside of vault using URIpath, it takes time and feels laggy. Might end up in performance issue. I can do one this, I might need to store the thumbnails as images for better UX and only when user wants to open the pdf it will be read from that path.
				const binData = await plugin.app.vault.readBinary(file);

				const pdf = await window.pdfjsLib.getDocument(binData).promise;
				const page = await pdf.getPage(1);
				const viewport = page.getViewport({ scale: 1 });
				const canvas = document.createElement("canvas");
				const context = canvas.getContext("2d");
				if (context) {
					canvas.width = viewport.width;
					canvas.height = viewport.height;
					await page.render({ canvasContext: context, viewport }).promise;
					setThumbnail(canvas.toDataURL());
				}
			} else if (file.path.endsWith(".epub")) {
				// Find out how to get first page of epub files
				const imagePath = plugin.app.vault.adapter.getResourcePath(normalizePath(`${plugin.manifest.dir}/assets/epubFileThumbnail.png`))
				setThumbnail(imagePath);
			} else {
				// Placeholder or default image.
				const imagePath = plugin.app.vault.adapter.getResourcePath(normalizePath(`${plugin.manifest.dir}/assets/mp3FileThumbnail.png`))
				setThumbnail(imagePath);
			}
		};

		generateThumbnail().catch((err) =>
			console.error("Error generating thumbnail:", err)
		);
	}, [file]);

	return (
		<div className="book-card" key={cardKey} style={{ backgroundImage: `url(${thumbnail})` }}>
			<div className="book-title">{file.path}</div>
			<button className="action-button">Action</button>
		</div>
	);
};
