import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const deal = await prisma.deal.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.value && { amount: parseFloat(body.value) }),
        ...(body.amount && { amount: parseFloat(body.amount) }),
        ...(body.currency && { currency: body.currency }),
        ...(body.stage && { stage: body.stage }),
        ...(body.probability && { probability: parseInt(body.probability) }),
        ...(body.contactId !== undefined && { contactId: body.contactId || null }),
        ...(body.companyId !== undefined && { companyId: body.companyId || null }),
        ...(body.expectedClose !== undefined && {
          expectedCloseDate: body.expectedClose ? new Date(body.expectedClose) : null,
        }),
        ...(body.expectedCloseDate !== undefined && {
          expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
        }),
      },
    });

    return NextResponse.json(deal);
  } catch (error) {
    console.error("Error updating deal:", error);
    return NextResponse.json(
      { error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.deal.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting deal:", error);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
