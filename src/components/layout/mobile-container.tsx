export const MobileContainer = ({
	children,
}: {
	children: React.ReactNode;
}) => {
	return (
		<div
			className='flex w-full flex-col bg-stone-50'
			style={{ height: '100dvh' }}
		>
			{children}
		</div>
	);
};
