// /src/LibraryManagement/components/Header.tsx

import { memo } from "react";

interface HeaderProps {
	navigationPath: string[]; // Array of navigation labels like ['Library', 'Highlights']
}

export const Header = memo(({ navigationPath }: HeaderProps) => {
	return (
		<div className="header">
			<div className="navigation">
				<span className="icon">📚</span>
				{navigationPath.map((path, index) => (
					<>
						<span key={index} className="nav-separator"> {index > 0 ? '>' : ''} </span>
						<span key={`${path}-${index}`} className="nav-item">{path}</span>
					</>
				))}
			</div>
		</div>
	);
});
