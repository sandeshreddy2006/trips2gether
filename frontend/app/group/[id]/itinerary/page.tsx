"use client";

import { use } from "react";
import ItineraryPlanner from "../../../../components/ItineraryPlanner";

export default function GroupItineraryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <ItineraryPlanner groupId={parseInt(id, 10)} />;
}
