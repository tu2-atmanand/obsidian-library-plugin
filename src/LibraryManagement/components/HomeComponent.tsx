// /src/LibraryManagement/components/HomeComponent.tsx

import { memo } from 'react';

export const HomeComponent = memo(({ onSourceClick }: { onSourceClick: (sourceName: string, sourcePath: string) => void }) => {
	return (
		<div className="libraryViewBodyHomeComponent">
			<section className="libraryViewBodyHomeComponentSection">
				<h2>Sources</h2>
				<div className="libraryViewBodyHomeComponentCards">
					<div
						className="libraryViewBodyHomeComponentCard"
						onClick={() => onSourceClick("Offline Books", "D:\\Books_Library\\NEW_PendingToRead\\Physics")}
					>
						Offline Books
					</div>
					<div
						className="libraryViewBodyHomeComponentCard"
						onClick={() => onSourceClick("Google Drive", "D:\\Books_Library\\GoogleDrive")}
					>
						Google Drive
					</div>
				</div>
			</section>

			<section className="libraryViewBodyHomeComponentSection">
				<h2>Recent Books</h2>
				<div className="libraryViewBodyHomeComponentCards">
					<div className="libraryViewBodyHomeComponentCard">Book 1</div>
					<div className="libraryViewBodyHomeComponentCard">Book 2</div>
				</div>
			</section>

			<section className="libraryViewBodyHomeComponentSection">
				<h2>Highlights</h2>
				<div className="libraryViewBodyHomeComponentCards">
					<div className="libraryViewBodyHomeComponentCard">Highlight 1</div>
					<div className="libraryViewBodyHomeComponentCard">Highlight 2</div>
				</div>
			</section>
		</div>
	);
});
