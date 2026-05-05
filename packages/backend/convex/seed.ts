"use node";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// Sample data for realistic test users
const FIRST_NAMES = [
  "Alex", "Jamie", "Casey", "Taylor", "Jordan", "Riley", "Morgan", "Avery",
  "Quinn", "Sage", "Blake", "Drew", "Emery", "Finley", "Hayden", "Parker",
  "Reese", "Rowan", "Skylar", "Cameron", "Devon", "Ellis", "Harley", "Kendall",
  "Lane", "London", "Marley", "Phoenix", "River", "Sam", "Seven", "Tatum",
  "Charlie", "Dakota", "Denver", "Justice", "Kai", "Lake", "Ocean", "Rain",
  "Sage", "Scout", "Story", "True", "Winter", "Aspen", "August", "Bay",
  "Blue", "Brooks", "Cedar", "Cruz", "Gray", "Hunter", "Indigo", "Jules",
];

const LAST_NAMES = [
  "Anderson", "Brown", "Chen", "Davis", "Evans", "Fisher", "Garcia", "Harris",
  "Jackson", "Kim", "Lee", "Martinez", "Nelson", "O'Connor", "Patel", "Quinn",
  "Rodriguez", "Smith", "Taylor", "Valdez", "Wilson", "Yang", "Zhang", "Adams",
  "Baker", "Clark", "Cooper", "Foster", "Green", "Hall", "Hill", "Jones",
  "Lewis", "Miller", "Moore", "Parker", "Roberts", "Turner", "Walker", "White",
  "Wright", "Young", "Allen", "Bell", "Carter", "Collins", "Cook", "Edwards",
  "Flores", "Gray", "Howard", "Hughes", "James", "Johnson", "King", "Lopez",
];

const DIETARY_RESTRICTIONS = [
  "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Nut allergy",
  "Shellfish allergy", "Kosher", "Halal", "Keto", "Paleo"
];

const SPECIAL_REQUESTS = [
  "Wheelchair accessible seating", "Table near stage", "Quiet area preferred",
  "Close to restrooms", "Group seating for 6", "Photography allowed",
  "Plus one requested", "VIP meet & greet", "Early entry preferred"
];

const COMPANIES = [
  "TechCorp", "StartupX", "Innovation Labs", "Digital Solutions", "Creative Agency",
  "Data Analytics Co", "Cloud Systems", "Mobile First", "AI Ventures", "Blockchain Inc"
];

function generateRandomName(): string {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${firstName} ${lastName}`;
}

function generateRandomEmail(name: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
  const providers = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com', 'example.org'];
  const provider = providers[Math.floor(Math.random() * providers.length)];
  const suffix = Math.floor(Math.random() * 1000);
  return `${cleanName}${suffix}@${provider}`;
}

function generateRandomPhone(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${number}`;
}

function generateMetadata(): Record<string, string> {
  const metadata: Record<string, string> = {};

  // 60% chance of dietary restriction
  if (Math.random() < 0.6) {
    const dietary = DIETARY_RESTRICTIONS[Math.floor(Math.random() * DIETARY_RESTRICTIONS.length)];
    metadata['dietary_restrictions'] = dietary;
  }

  // 40% chance of special request
  if (Math.random() < 0.4) {
    const request = SPECIAL_REQUESTS[Math.floor(Math.random() * SPECIAL_REQUESTS.length)];
    metadata['special_request'] = request;
  }

  // 30% chance of company
  if (Math.random() < 0.3) {
    const company = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
    metadata['company'] = company;
  }

  // 20% chance of plus one count
  if (Math.random() < 0.2) {
    const plusOnes = Math.floor(Math.random() * 3) + 1;
    metadata['plus_ones'] = plusOnes.toString();
  }

  return metadata;
}

export const seedTestRSVPs = action({
  args: {
    eventId: v.optional(v.id("events")),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string; eventId?: Id<"events"> }> => {
    // Only allow in development
    if (process.env.NODE_ENV === "production") {
      throw new Error("Seed script only available in development");
    }

    const count = args.count || 1000;
    let eventId = args.eventId;

    // Create a test event if none provided
    if (!eventId) {
      const testEventResult = await ctx.runAction(api.eventsNode.create, {
        name: "Test Event - RSVP Stress Test",
        hosts: ["test@example.com"],
        location: "Virtual Event Center",
        eventDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // 1 week from now
        lists: [
          { listKey: "vip", password: "vip123", generateQR: true },
          { listKey: "ga", password: "general456", generateQR: true },
          { listKey: "staff", password: "staff789", generateQR: false },
          { listKey: "media", password: "press999", generateQR: true },
        ],
        customFields: [
          { key: "dietary_restrictions", label: "Dietary Restrictions", placeholder: "Any dietary needs?" },
          { key: "company", label: "Company", placeholder: "Your company name" },
          { key: "special_request", label: "Special Requests", placeholder: "Any special accommodations?" },
          { key: "plus_ones", label: "Plus Ones", placeholder: "Number of guests" },
        ],
      });
      eventId = testEventResult.eventId;
    }

    const listKeys = ["vip", "ga", "staff", "media"];
    const statuses = ["pending", "approved", "denied"];

    // Status distribution: 40% approved, 30% pending, 30% denied
    const statusWeights = [0.3, 0.4, 0.3]; // pending, approved, denied

    const results = {
      created: 0,
      errors: 0,
    };

    console.log(`Starting to seed ${count} RSVPs for event ${eventId}`);

    for (let i = 0; i < count; i++) {
      try {
        const name = generateRandomName();
        const email = generateRandomEmail(name);
        const phone = generateRandomPhone();
        const listKey = listKeys[Math.floor(Math.random() * listKeys.length)];

        // Weighted random status selection
        const random = Math.random();
        let status: string;
        if (random < statusWeights[0]) {
          status = "pending";
        } else if (random < statusWeights[0] + statusWeights[1]) {
          status = "approved";
        } else {
          status = "denied";
        }

        const metadata = generateMetadata();

        // Create a fake Clerk user ID
        const clerkUserId = `seed_user_${Date.now()}_${i}`;

        const now = Date.now();

        // Insert user record
        await ctx.runMutation(api.users.create, {
          clerkUserId,
          phone,
        });

        // Insert RSVP
        const rsvpId = await ctx.runMutation(api.rsvps.createDirect, {
          eventId: eventId as Id<"events">,
          clerkUserId,
          listKey,
          shareContact: Math.random() > 0.3, // 70% share contact
          note: Math.random() > 0.7 ? `Looking forward to the event! - ${name}` : undefined,
          status,
          createdAt: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000), // Random time in last 30 days
        });

        // If approved, maybe create redemption code (80% chance)
        if (status === "approved" && Math.random() < 0.8) {
          await ctx.runMutation(api.redemptions.createForRSVP, {
            rsvpId,
            eventId: eventId as Id<"events">,
            clerkUserId,
            listKey,
          });
        }

        results.created++;

        // Log progress every 100 records
        if (i % 100 === 0) {
          console.log(`Seeded ${i}/${count} RSVPs...`);
        }

      } catch (error) {
        console.error(`Error creating RSVP ${i}:`, error);
        results.errors++;
      }
    }

    console.log(`Seed complete! Created ${results.created} RSVPs with ${results.errors} errors`);

    return {
      success: true,
      message: `Successfully created ${results.created} test RSVPs (${results.errors} errors)`,
      eventId: eventId as Id<"events">,
    };
  },
});

export const clearTestData = action({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string }> => {
    // Only allow in development
    if (process.env.NODE_ENV === "production") {
      throw new Error("Clear test data only available in development");
    }

    // Delete all RSVPs for the event
    const rsvps = await ctx.runQuery(api.rsvps.listForEvent, { eventId: args.eventId });

    let deletedCount = 0;
    for (const rsvp of rsvps) {
      try {
        // Delete related redemptions
        await ctx.runMutation(api.redemptions.deleteForRSVP, { rsvpId: rsvp.id });

        // Delete the RSVP
        await ctx.runMutation(api.rsvps.deleteRSVP, { rsvpId: rsvp.id });

        // Delete the user if it's a seed user
        if (rsvp.clerkUserId.startsWith("seed_user_")) {
          await ctx.runMutation(api.users.deleteUser, { clerkUserId: rsvp.clerkUserId });
        }

        deletedCount++;
      } catch (error) {
        console.error(`Error deleting RSVP ${rsvp.id}:`, error);
      }
    }

    return {
      success: true,
      message: `Deleted ${deletedCount} test RSVPs and related data`,
    };
  },
});