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

    const companies = await prisma.company.findMany({
      include: {
        _count: {
          select: { contacts: true, deals: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(companies);
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies" },
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
    const { name, email, phone, website, industry, description, inn, kpp, ogrn, legalAddress, actualAddress } = body;

    const company = await prisma.company.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        website: website || null,
        industry: industry || null,
        description: description || null,
        inn: inn || null,
        kpp: kpp || null,
        ogrn: ogrn || null,
        legalAddress: legalAddress || null,
        actualAddress: actualAddress || null,
      },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "Failed to create company" },
      { status: 500 }
    );
  }
}
