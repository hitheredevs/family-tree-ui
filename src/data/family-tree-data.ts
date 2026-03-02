import type { Person, User } from '../types';

export const initialPeople: Record<string, Person> = {
    azhar: {
        id: 'azhar',
        firstName: 'Azhar',
        lastName: 'Mahmood',
        gender: 'male',
        isDeceased: false,
        parentIds: ['tahir', 'shabnam'],
        spouseId: null,
        childrenIds: [],
        createdBy: 'system',
        updatedBy: 'system',
    },
    tahir: {
        id: 'tahir',
        firstName: 'Tahir',
        lastName: 'Mahmood',
        gender: 'male',
        isDeceased: false,
        parentIds: [],
        spouseId: 'shabnam',
        childrenIds: ['azhar'],
        createdBy: 'system',
        updatedBy: 'system',
    },
    shabnam: {
        id: 'shabnam',
        firstName: 'Shabnam',
        lastName: '',
        gender: 'female',
        isDeceased: false,
        parentIds: [],
        spouseId: 'tahir',
        childrenIds: ['azhar'],
        createdBy: 'system',
        updatedBy: 'system',
    },
};

export const initialUsers: User[] = [
    {
        id: 'user-azhar',
        username: 'azhar',
        personId: 'azhar',
        role: 'admin',
        mustChangePassword: false,
    },
];
