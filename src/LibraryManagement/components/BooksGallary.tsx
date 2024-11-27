import { Platform, TFile, normalizePath } from "obsidian";
import { useEffect, useState } from "react";

import { BookCard } from "./BookCard";
import LibraryPlugin from "main";

interface BooksGallaryProps {
	plugin: LibraryPlugin;
	sourceName: string; // E.g., "Offline Books"
	sourcePath: string; // E.g., "D:\\Books_Library\\NEW_PendingToRead\\Physics"
	onBack: () => void; // Function to go back to HomeComponent
}

export const BooksGallary: React.FC<BooksGallaryProps> = ({
	plugin,
	sourceName,
	sourcePath,
	onBack,
}) => {
	const [books, setBooks] = useState<TFile[]>([]);


	useEffect(() => {
		const fetchFiles = async () => {
			try {
				// Get all files from the vault
				const files = plugin.app.vault.getFiles();

				// Filter files based on the specified path and extensions
				const filteredFiles = files.filter(
					(file) =>
						file.path.startsWith('0_Attachements') && // This all is temparary, find out how to read files from outside vault.
						["pdf", "epub", "mp3"].includes(file.extension.toLowerCase())
				);

				setBooks(filteredFiles);
			} catch (err) {
				console.error("Error fetching files from vault:", err);
			}
		};

		fetchFiles();
	}, [sourcePath]);

	return (
		<div className="books-gallary">
			<h1>Content Inside {sourceName}</h1>
			<div className="gallery-content">
				{books.map((book, index) => (
					<BookCard 
						key={index}
						plugin={plugin}
						cardKey={index}
						file={book} />
				))}
			</div>
			<button onClick={onBack} className="back-button">
				Go Back
			</button>
		</div>
	);
};
