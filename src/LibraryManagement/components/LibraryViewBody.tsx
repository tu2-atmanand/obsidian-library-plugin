// /src/LibraryManagement/components/LibraryBody.tsx

import { BooksGallary } from "./BooksGallary";
import { Header } from "./Header";
import { HomeComponent } from "./HomeComponent";
import LibraryPlugin from "../../main";
import { useState } from "react";

const LibraryViewBody: React.FC<{ plugin: LibraryPlugin }> = ({ plugin }) => {
	const [activeView, setActiveView] = useState<"home" | "gallery">("home");
	const [galleryProps, setGalleryProps] = useState<{ sourceName: string; sourcePath: string } | null>(null);

	const handleSourceClick = (sourceName: string, sourcePath: string) => {
		setGalleryProps({ sourceName, sourcePath });
		setActiveView("gallery");
	};

	const handleBack = () => {
		setActiveView("home");
		setGalleryProps(null);
	};

	return (
		<div className="libraryViewBody">
			<Header key={'Header'} navigationPath={["Library"]} />
			{activeView === "home" && <HomeComponent key={'HomeComponent'} onSourceClick={handleSourceClick} />}
			{activeView === "gallery" && galleryProps && (
				<BooksGallary
					key={'BooksGallery'}
					plugin={plugin}
					sourceName={galleryProps.sourceName}
					sourcePath={galleryProps.sourcePath}
					onBack={handleBack}
				/>
			)}
		</div>
	);
};

export default LibraryViewBody;
