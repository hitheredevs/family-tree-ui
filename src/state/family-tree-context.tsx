import {
	createContext,
	useContext,
	useReducer,
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type Dispatch,
} from 'react';
import type { Person, User } from '../types';
import * as api from '../services/api-client';

/* ------------------------------------------------------------------ */
/*  State shape                                                        */
/* ------------------------------------------------------------------ */

interface AddPersonModal {
	isOpen: boolean;
	relativePersonId: string | null;
	relationType: 'parent' | 'child' | 'spouse' | 'sibling' | null;
}

interface ManageRelationshipsModal {
	isOpen: boolean;
	personId: string | null;
}

export interface UndoEntry {
	label: string;
	action: () => Promise<void>;
}

export interface AppState {
	people: Record<string, Person>;
	currentUser: User | null;
	isAdminMode: boolean;
	selectedPersonId: string | null;
	editingPersonId: string | null;
	addPersonModal: AddPersonModal;
	manageRelationshipsModal: ManageRelationshipsModal;
	undoStack: UndoEntry[];
	loading: boolean;
	error: string | null;
	/** Bumped after any tree mutation — the canvas reloads when it changes */
	treeVersion: number;
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

export type AppAction =
	| { type: 'SET_AUTH'; user: User }
	| { type: 'LOGOUT' }
	| { type: 'LOAD_TREE'; people: Record<string, Person> }
	| { type: 'UPDATE_PERSON'; person: Partial<Person> & { id: string } }
	| { type: 'SET_LOADING'; loading: boolean }
	| { type: 'SET_ERROR'; error: string | null }
	| { type: 'SELECT_PERSON'; personId: string | null }
	| { type: 'SET_EDITING'; personId: string | null }
	| { type: 'TOGGLE_ADMIN_MODE' }
	| {
			type: 'OPEN_ADD_PERSON_MODAL';
			relativePersonId?: string;
			relationType?: 'parent' | 'child' | 'spouse' | 'sibling';
	  }
	| { type: 'CLOSE_ADD_PERSON_MODAL' }
	| { type: 'OPEN_MANAGE_RELATIONSHIPS_MODAL'; personId: string }
	| { type: 'CLOSE_MANAGE_RELATIONSHIPS_MODAL' }
	| { type: 'PUSH_UNDO'; entry: UndoEntry }
	| { type: 'POP_UNDO' }
	| { type: 'TREE_MUTATED' };

/* ------------------------------------------------------------------ */
/*  Initial state                                                      */
/* ------------------------------------------------------------------ */

const initialState: AppState = {
	people: {},
	currentUser: null,
	isAdminMode: false,
	selectedPersonId: null,
	editingPersonId: null,
	addPersonModal: {
		isOpen: false,
		relativePersonId: null,
		relationType: null,
	},
	manageRelationshipsModal: {
		isOpen: false,
		personId: null,
	},
	undoStack: [],
	loading: false,
	error: null,
	treeVersion: 0,
};

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

function reducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case 'SET_AUTH':
			return { ...state, currentUser: action.user };

		case 'LOGOUT':
			return { ...initialState };

		case 'LOAD_TREE':
			return { ...state, people: action.people, loading: false, error: null };

		case 'UPDATE_PERSON': {
			const existing = state.people[action.person.id];
			if (!existing) return state;
			return {
				...state,
				people: {
					...state.people,
					[action.person.id]: { ...existing, ...action.person },
				},
			};
		}

		case 'SET_LOADING':
			return { ...state, loading: action.loading };

		case 'SET_ERROR':
			return { ...state, error: action.error, loading: false };

		case 'SELECT_PERSON':
			return { ...state, selectedPersonId: action.personId };

		case 'SET_EDITING':
			return {
				...state,
				editingPersonId: action.personId,
				selectedPersonId: null,
			};

		case 'TOGGLE_ADMIN_MODE':
			return { ...state, isAdminMode: !state.isAdminMode };

		case 'OPEN_ADD_PERSON_MODAL':
			return {
				...state,
				addPersonModal: {
					isOpen: true,
					relativePersonId: action.relativePersonId ?? null,
					relationType: action.relationType ?? null,
				},
			};

		case 'CLOSE_ADD_PERSON_MODAL':
			return {
				...state,
				addPersonModal: {
					isOpen: false,
					relativePersonId: null,
					relationType: null,
				},
			};

		case 'OPEN_MANAGE_RELATIONSHIPS_MODAL':
			return {
				...state,
				manageRelationshipsModal: {
					isOpen: true,
					personId: action.personId,
				},
			};

		case 'CLOSE_MANAGE_RELATIONSHIPS_MODAL':
			return {
				...state,
				manageRelationshipsModal: {
					isOpen: false,
					personId: null,
				},
			};

		case 'PUSH_UNDO':
			return {
				...state,
				undoStack: [...state.undoStack, action.entry],
			};

		case 'POP_UNDO':
			return {
				...state,
				undoStack: state.undoStack.slice(0, -1),
			};

		case 'TREE_MUTATED':
			return { ...state, treeVersion: state.treeVersion + 1 };

		default:
			return state;
	}
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface FamilyTreeContextType {
	state: AppState;
	dispatch: Dispatch<AppAction>;
	currentUser: User | null;
	centerPersonId: string;
	treeVersion: number;
	refreshTree: () => Promise<void>;
}

const FamilyTreeContext = createContext<FamilyTreeContextType | null>(null);

interface ProviderProps {
	children: ReactNode;
	initialUser: User;
}

export function FamilyTreeProvider({ children, initialUser }: ProviderProps) {
	const [state, dispatch] = useReducer(reducer, {
		...initialState,
		currentUser: initialUser,
	});

	const currentUser = state.currentUser;
	const centerPersonId = currentUser?.personId ?? '';

	const refreshTree = useCallback(async () => {
		if (!centerPersonId) return;
		dispatch({ type: 'SET_LOADING', loading: true });
		try {
			console.info('Loading family tree layout', { centerPersonId });
			const data = await api.getSubtreeLayout(centerPersonId);
			if (!data?.people || typeof data.people !== 'object') {
				throw new Error('Tree response did not include people data');
			}
			console.info('Family tree layout loaded', {
				centerPersonId,
				peopleCount: Object.keys(data.people).length,
			});
			dispatch({ type: 'LOAD_TREE', people: data.people });
		} catch (err) {
			console.error('Family tree load failed', err);
			dispatch({
				type: 'SET_ERROR',
				error: err instanceof Error ? err.message : 'Failed to load tree',
			});
		}
	}, [centerPersonId]);

	return (
		<FamilyTreeContext.Provider
			value={{
				state,
				dispatch,
				currentUser,
				centerPersonId,
				treeVersion: state.treeVersion,
				refreshTree,
			}}
		>
			{children}
		</FamilyTreeContext.Provider>
	);
}

export function useFamilyTree() {
	const context = useContext(FamilyTreeContext);
	if (!context) {
		throw new Error('useFamilyTree must be used within FamilyTreeProvider');
	}
	return context;
}

/**
 * Fetches full person details (bio, phone, socials, etc.) on demand.
 * Returns the enriched person once loaded, or the slim version while loading.
 */
export function usePersonDetails(personId: string | null) {
	const { state, dispatch } = useFamilyTree();
	const [loading, setLoading] = useState(false);
	const fetchedRef = useRef<string | null>(null);

	const person = personId ? (state.people[personId] ?? null) : null;

	// Fetch full details if we have a slim record (no createdBy means it came from layout endpoint)
	useEffect(() => {
		if (!personId || !person) return;
		if (fetchedRef.current === personId) return;
		// If the person already has detail fields, skip
		if (person.bio !== undefined || person.phoneNumber !== undefined) return;

		fetchedRef.current = personId;
		setLoading(true);
		api
			.getPerson(personId)
			.then((full) => {
				dispatch({
					type: 'UPDATE_PERSON',
					person: full as Partial<Person> & { id: string },
				});
			})
			.catch((err) => {
				console.error('Failed to fetch person details', personId, err);
			})
			.finally(() => setLoading(false));
	}, [personId, person, dispatch]);

	return { person, loading };
}
