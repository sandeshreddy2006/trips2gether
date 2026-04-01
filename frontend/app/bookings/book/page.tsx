'use client';

import { Suspense } from 'react';
import BookingPage from '../../../components/BookingPage';

export default function BookFlightPage() {
    return (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>}>
            <BookingPage />
        </Suspense>
    );
}
