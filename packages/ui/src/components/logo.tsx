import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={512}
		height={512}
		viewBox="0 0 512 512"
		fill="none"
		aria-label="Trading Academy CRM logo"
		{...props}
	>
		<path
			d="M64 368 208 224l80 80 160-160"
			stroke="currentColor"
			strokeWidth={48}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M336 144h112v112"
			stroke="currentColor"
			strokeWidth={48}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);
export default Logo;
