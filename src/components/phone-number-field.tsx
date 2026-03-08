import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';

export function PhoneNumberField({
	value,
	onChange,
	placeholder = 'Enter phone number',
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) {
	return (
		<PhoneInput
			international
			defaultCountry='IN'
			countryCallingCodeEditable={false}
			placeholder={placeholder}
			value={value || undefined}
			onChange={(nextValue) => onChange(nextValue ?? '')}
			className='phone-field'
		/>
	);
}
