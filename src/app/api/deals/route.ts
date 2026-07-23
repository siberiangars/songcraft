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

    const deals = await prisma.deal.findMany({
      include: {
        contact: {
          select: { firstName: true, lastName: true },
        },
        company: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(deals);
  } catch (error) {
    console.error("Error fetching deals:", error);
    return NextResponse.json(
      { error: "Failed to fetch deals" },
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
    const { title, value, currency, stage, probability, contactId, companyId, description, expectedClose } = body;

    const deal = await prisma.deal.create({
      data: {
        title,
        description: description || null,
        amount: parseFloat(value) || 0,
        currency: currency || "RUB",
        stage: stage || "NEW",
        probability: parseInt(probability) || 50,
        contactId: contactId || null,
        companyId: companyId || null,
        expectedCloseDate: expectedClose ? new Date(expectedClose) : null,
        assigneeId: session.user.id,
      },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    console.error("Error creating deal:", error);
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
