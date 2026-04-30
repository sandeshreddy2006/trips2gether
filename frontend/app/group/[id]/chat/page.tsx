"use client";

import { use } from "react";
import GroupChatThread from "../../../../components/GroupChatThread";

export default function GroupChatPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <GroupChatThread groupId={parseInt(id, 10)} />;
}
