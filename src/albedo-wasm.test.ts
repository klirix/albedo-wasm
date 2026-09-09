import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Bucket, Query, where } from "./albedo-wasm";
import { after, before } from "node:test";
import { serialize } from "./bson";

describe("Albedo WASM", () => {
  describe("Bucket.open", () => {
    test("should open an in-memory bucket", () => {
      const bucket = Bucket.open(":memory:");
      expect(bucket).toBeInstanceOf(Bucket);
      bucket.close();
    });

    test("should open a file-based bucket", async () => {
      const bucket = Bucket.open("test-bucket.albedo");
      expect(bucket).toBeInstanceOf(Bucket);
      bucket.close();
      const file = Bun.file("test-bucket.albedo");
      expect(await file.exists()).toBe(true);
      await file.delete();
    });
  });

  describe("Bucket.transform", () => {
    test("should transform data correctly", async () => {
      const bucket = Bucket.open("test-bucket.albedo");
      bucket.insert({ name: "Alice", age: 30 });
      bucket.insert({ name: "Bob", age: 25 });
      const transformCursor = bucket.transformCursor({});
      let doc = transformCursor.next().value;
      while (doc) {
        doc = transformCursor.next({ ...doc, age: doc.age + 5 }).value;
      }
      const allItems = bucket.all({}, {});
      expect(allItems.length).toBe(2);
      expect(allItems.find((item) => item.name === "Alice")?.age).toBe(35);
      expect(allItems.find((item) => item.name === "Bob")?.age).toBe(30);
      bucket.close();
      await Bun.file("test-bucket.albedo").delete();
    });

    test("should handle all cases in transform", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Charlie", age: 40 });
      bucket.insert({ name: "Bon", age: 40 });
      bucket.insert({ name: "Balice", age: 40 });
      bucket.transform({}, (doc) => {
        switch (doc.name) {
          case "Charlie":
            // Update
            return { ...doc, age: doc.age + 10 };
          case "Bon":
            // Delete
            return null;
          case "Balice":
            // No-op
            return undefined;
          default:
            return doc;
        }
      });

      const allItems = bucket.all({}, {});
      expect(allItems.length).toBe(2);
      expect(allItems.find((item) => item.name === "Charlie")?.age).toBe(50);
      expect(allItems.find((item) => item.name === "Balice")?.age).toBe(40);
      bucket.close();
    });

    test.skip("should use idx for transform", () => {
      const bucket = Bucket.open(":memory:");
      for (let i = 0; i < 100000; i++) {
        bucket.insert({ _id: i, value: `item${i}` });
      }
      console.time("transform with idx");
      bucket.transform({ _id: 50000 }, (doc) => {
        return { ...doc, value: "updatedItem500" };
      });
      console.timeEnd("transform with idx");

      console.time("transform with idx");
      bucket.transform({ _id: 99999 }, (doc) => {
        return { ...doc, value: "updatedItem600" };
      });
      console.timeEnd("transform with idx");

      const item = bucket.get({ _id: 99999 }, {});

      expect(item?.value).toBe("updatedItem600");
    });
  });

  describe("Bucket.insert and Bucket.all", () => {
    test.skip("Insertion works and retrieves all items", async () => {
      const bucket = Bucket.open("test-bucket.albedo");
      expect(bucket).toBeInstanceOf(Bucket);

      console.time("insertion x 10k");
      for (let i = 0; i < 10000; i++) {
        bucket.insert({
          hello: `world${i}`,
          _id: i,
          date: new Date(),
          counter: i,
        });
      }
      console.timeEnd("insertion x 10k");

      console.time("read all docs");
      const allItems = bucket.all({}, {});
      console.timeEnd("read all docs");
      console.time("read all docs warmed up pages");
      const allItems2 = bucket.all({}, {});
      console.timeEnd("read all docs warmed up pages");

      console.time("scan docs warmed up pages");
      const scanItems = bucket.all({ counter: 5555 }, {});
      console.timeEnd("scan docs warmed up pages");
      console.time("idx fetching");
      let idxItems = bucket.all({ _id: { $eq: 5555 } }, {});
      console.timeEnd("idx fetching");
      console.time("idx fetching warmed up pages");
      idxItems = bucket.all({ _id: { $eq: 5555 } }, {});
      console.timeEnd("idx fetching warmed up pages");
      console.time("idx fetching warmed up pages");
      idxItems = bucket.all({ _id: { $eq: 5555 } }, {});
      console.timeEnd("idx fetching warmed up pages");
      console.time("idx fetching warmed up pages");
      idxItems = bucket.all({ _id: { $eq: 5555 } }, {});
      console.timeEnd("idx fetching warmed up pages");
      expect(allItems.length).toBe(10000);
      expect(idxItems.length).toBe(1);
      expect(idxItems[0]?._id).toBe(5555);

      bucket.close();
      const file = Bun.file("test-bucket.albedo");
      expect(await file.exists()).toBe(true);
      file.delete();

      console.log(" == test sqlite for comparison ==");
      const db = new Database("test-bucket-sqlite.db");
      db.run(
        "CREATE TABLE items ( doc BLOB ); create index idx_id on items (json_extract(doc, '$._id'));"
      );
      const insertStmt = db.prepare(
        "INSERT INTO items (doc) VALUES (json(?));"
      );

      console.time("sqlite insertion x 10k");
      for (let i = 0; i < 10000; i++) {
        insertStmt.run(
          JSON.stringify({
            hello: `world${i}`,
            _id: i,
            date: new Date(),
            counter: i,
          })
        );
      }
      console.timeEnd("sqlite insertion x 10k");

      const allSqliteItemsStmt = db.prepare<{ doc: string }, []>(
        "SELECT doc FROM items where json_extract(doc, '$._id') != 20000;"
      );
      console.time("sqlite read all docs");
      let all = [];
      for (const element of allSqliteItemsStmt.iterate()) {
        all.push(JSON.parse(element.doc));
      }
      console.timeEnd("sqlite read all docs");
      console.log(all[all.length - 1]);
      all = [];
      console.time("sqlite read all docs warmed up pages");
      for (const element of allSqliteItemsStmt.iterate()) {
        all.push(JSON.parse(element.doc));
      }
      console.timeEnd("sqlite read all docs warmed up pages");

      console.time("sqlite scan docs warmed up pages");
      const scanSqliteItemsStmt = db.prepare<{ doc: string }, [number]>(
        "SELECT doc FROM items WHERE json_extract(doc, '$.counter') = ?;"
      );
      let scanSqliteItems = JSON.stringify(scanSqliteItemsStmt.get(5555)!.doc);
      console.timeEnd("sqlite scan docs warmed up pages");

      console.time("sqlite idx fetching");
      const idxSqliteItemsStmt = db.prepare(
        "SELECT doc FROM items WHERE json_extract(doc, '$._id') = ?;"
      );
      let idxSqliteItems = idxSqliteItemsStmt.get(5555);
      console.timeEnd("sqlite idx fetching");
      console.time("sqlite idx fetching warmed up pages");

      const idxSqliteItemsStmt2 = db.prepare(
        "SELECT doc FROM items WHERE json_extract(doc, '$._id') = ?;"
      );
      idxSqliteItems = idxSqliteItemsStmt2.get(5555);
      console.timeEnd("sqlite idx fetching warmed up pages");

      db.close();
      const sqliteFile = Bun.file("test-bucket-sqlite.db");
      expect(await sqliteFile.exists()).toBe(true);
      sqliteFile.delete();
    });
  });

  describe("Bucket.get searches properly", () => {
    let bucket: Bucket;
    before(() => {
      bucket = Bucket.open("bucket-get-test.albedo");
      bucket.insert({ name: "Alice", age: 30, userId: 1 });
      bucket.insert({ name: "Bob", age: 25, userId: 2 });
    });
    test("should get by exact match", () => {
      const alice = bucket.get({ userId: 1 });
      expect(alice?.name).toBe("Alice");
      expect(alice?.age).toBe(30);
    });

    test("should return null for non-existing document", () => {
      const charlie = bucket.get({ userId: 3 });
      expect(charlie).toBeNull();
    });

    test("should search by string field", () => {
      const bob = bucket.get({ name: "Bob" });
      expect(bob?.userId).toBe(2);
    });

    after(async () => {
      bucket.close();
      await Bun.file("bucket-get-test.albedo").delete();
    });
  });

  describe("query expressions", () => {
    test("supports $or, $and, and $nor", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Alice", role: "admin", deleted: false, verified: true });
      bucket.insert({ name: "Bob", role: "user", deleted: false, verified: true });
      bucket.insert({ name: "Carol", role: "user", deleted: true, verified: true });
      bucket.insert({ name: "Dave", role: "guest", deleted: false, verified: false });

      const results = bucket.all({
        query: {
          $or: [
            { role: "admin" },
            { $and: [{ verified: true }, { role: "user" }] },
          ],
          $nor: [{ deleted: true }],
        },
      }) as Array<{ name: string }>;

      expect(results.map((doc) => doc.name)).toEqual(["Alice", "Bob"]);
      bucket.close();
    });

    test("Query builder composes logical clauses", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Alice", role: "admin", deleted: false, verified: true });
      bucket.insert({ name: "Bob", role: "user", deleted: false, verified: true });
      bucket.insert({ name: "Carol", role: "user", deleted: true, verified: true });

      const query = Query.or(
        where("role", "admin"),
        Query.and(where("verified", true), where("role", "user")),
      ).nor(where("deleted", true));

      const results = bucket.all(query) as Array<{ name: string }>;
      expect(results.map((doc) => doc.name)).toEqual(["Alice", "Bob"]);
      bucket.close();
    });

    test("projection pick returns selected fields", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Ada", email: "ada@example.com", secret: "hidden" });
      const doc = bucket.get(
        { name: "Ada" },
        { projection: { pick: ["name", "email"] } },
      );
      expect(doc?.name).toBe("Ada");
      expect(doc?.email).toBe("ada@example.com");
      expect(doc?.secret).toBeUndefined();
      bucket.close();
    });
  });

  describe("indexes", () => {
    test("ensureIndex, listIndexes, and dropIndex", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Alice" });
      bucket.ensureIndex("name", { unique: false, sparse: true, reverse: false });
      expect(bucket.indexes.name).toMatchObject({
        name: "name",
        unique: false,
        sparse: true,
        reverse: false,
      });
      expect(bucket.dropIndex("name")).toBe(true);
      expect(bucket.indexes.name).toBeUndefined();
      bucket.close();
    });
  });

  describe("transfigurate", () => {
    test("applies a single native update stage", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "stark", age: 40, marriage: "catelyn" });
      bucket.insert({ name: "lannister", age: 35 });

      const updated = bucket.transfigurate({ name: "stark" }, {
        $set: { age: { $plus: ["$.age", 1] }, state: "dead" },
        $unset: "marriage",
      });
      expect(updated).toBe(1);

      const stark = bucket.get<{ age: number; state: string; marriage?: string }>({
        name: "stark",
      });
      expect(stark?.age).toBe(41);
      expect(stark?.state).toBe("dead");
      expect(stark?.marriage).toBeUndefined();
      bucket.close();
    });

    test("applies a pipeline of stages", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ first: "Arya", last: "Stark" });
      const updated = bucket.transfigurate(undefined, [
        { $set: { fullName: { $concat: ["$.first", " ", "$.last"] } } },
        { $unset: ["first", "last"] },
      ]);
      expect(updated).toBe(1);
      const doc = bucket.get<{ fullName: string; first?: string; last?: string }>({});
      expect(doc?.fullName).toBe("Arya Stark");
      expect(doc?.first).toBeUndefined();
      expect(doc?.last).toBeUndefined();
      bucket.close();
    });
  });

  describe("transactions", () => {
    test("Bucket.tx commits inserts, updates, and deletes together", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Alice", count: 1 });
      bucket.insert({ name: "Bob", count: 2 });

      const result = bucket.tx((tx) => {
        tx.insert({ name: "Charlie", count: 3 });
        tx.update({ name: "Alice" }, (doc: any) => ({ ...doc, name: "Doofus" }));
        tx.delete({ name: "Bob" });
        return "committed";
      });

      expect(result).toBe("committed");
      const results = bucket.all() as Array<{ name: string }>;
      expect(results).toHaveLength(2);
      expect(results.map((doc) => doc.name).sort()).toEqual(["Charlie", "Doofus"]);
      bucket.close();
    });

    test("Bucket.tx rolls back if the callback throws", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Alice", count: 1 });
      bucket.insert({ name: "Bob", count: 2 });

      expect(() =>
        bucket.tx((tx) => {
          tx.insert({ name: "Charlie", count: 3 });
          tx.delete({ name: "Bob" });
          throw new Error("boom");
        }),
      ).toThrow("boom");

      const results = bucket.all() as Array<{ name: string }>;
      expect(results.map((doc) => doc.name).sort()).toEqual(["Alice", "Bob"]);
      bucket.close();
    });

    test("Transaction.transfigurate rolls back with the transaction", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "stark", age: 40 });

      expect(() =>
        bucket.tx((tx) => {
          expect(
            tx.transfigurate({ name: "stark" }, { $set: { age: 99 } }),
          ).toBe(1);
          throw new Error("rollback please");
        }),
      ).toThrow("rollback please");

      expect(bucket.get<{ age: number }>({ name: "stark" })?.age).toBe(40);
      bucket.close();
    });
  });

  describe("maintenance", () => {
    test("checkpoint and flush do not throw", () => {
      const bucket = Bucket.open(":memory:");
      bucket.insert({ name: "Alice" });
      expect(() => bucket.checkpoint()).not.toThrow();
      expect(() => bucket.flush()).not.toThrow();
      bucket.close();
    });

    test("open accepts bucket options", () => {
      const bucket = Bucket.open(":memory:", {
        wal: false,
        auto_vaccuum: true,
        write_durability: "manual",
      });
      bucket.insert({ name: "Ada" });
      expect(bucket.get({ name: "Ada" })?.name).toBe("Ada");
      bucket.close();
    });
  });
});
