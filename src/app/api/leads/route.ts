import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const leads = await prisma.lead.findMany({
      include: {
        owner: {
          select: { name: true },
        },
        _count: {
          select: { messages: true, conversations: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, email, telegramId, whatsappId, source, notes } = body;

    const lead = await prisma.lead.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        telegramId: telegramId || null,
        whatsappId: whatsappId || null,
        source: source || "MANUAL",
        notes: notes || null,
        status: "NEW",
        stage: "INIT",
        score: 50,
        ownerId: session.user.id,
      },
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        type: "LEAD_CREATED",
        description: `Создан новый лид: ${name}`,
        leadId: lead.id,
        userId: session.user.id,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("Error creating lead:", error);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
