"use client";
import { use } from "react";
import GroupDetail from "../../../components/GroupDetail";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <GroupDetail groupId={parseInt(id, 10)} />;
}
