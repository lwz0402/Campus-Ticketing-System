# API 文档

本文档根据 [main.js](/Users/wenzhengliu/Documents/Gewuqingchun/main.js:1733) 中的服务端实现整理，涵盖 HTTP 接口与 `Socket.IO` 实时事件。

## 通用约定

- Base URL: 同当前服务地址，例如 `http://localhost:3000`
- 认证方式: Cookie Session，登录后服务端设置 `sessionId`
- 返回格式: 除导出类接口外，默认返回 JSON
- 时间字段: 基本为 `number`，表示毫秒时间戳
- 角色:
  - `admin`
  - `sales`

## 通用错误

常见错误响应:

```json
{
  "error": "错误说明"
}
```

部分接口会额外返回:

```json
{
  "error": "需要二次确认",
  "code": "CONFIRM_REQUIRED",
  "action": "project:delete",
  "detail": "删除项目“示例项目”",
  "confirmToken": "uuid",
  "expiresAt": 1760000000000
}
```

## 二次确认机制

系统里有两种确认方式:

- `confirmToken`
  - 用于删除、恢复、批量导入等危险操作
  - 第一次请求时如果未带 `confirmToken`，接口会返回 `409` 和 `CONFIRM_REQUIRED`
  - 前端拿到 `confirmToken` 后再次请求同一接口即可完成操作
- `confirm: true`
  - 用于部分券类操作
  - 如果未传，会返回 `400` 和 `CONFIRM_REQUIRED`

## 核心数据结构

### Account

```ts
type Account = {
  username: string;
  role: 'admin' | 'sales';
  createdAt: number;
  updatedAt: number;
};
```

### Seat

```ts
type Seat = {
  row: number;
  col: number;
  status: 'disabled' | 'available' | 'locked' | 'sold';
  price: number | null;
  ticketNumber: string | null;
  ticketCode?: string | null;
  seatLabel: string | null;
  lockedBy?: string | null;
  lockExpiresAt?: number | null;
  issuedAt: number | null;
  checkedInAt: number | null;
  checkedInBy: string | null;
};
```

### Project

```ts
type Project = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  createdAt: number;
  updatedAt: number;
  seats: Record<string, Seat>;
  ticketing: {
    mode: 'random' | 'sequence';
    sequence: null | {
      template: string;
      width: number;
      startValue: number;
      nextValue: number;
      maxValue: number;
      prefix: string;
      startString?: string;
    };
  };
  priceColorAssignments: Record<string, string>;
  seatLabelProgress: Record<string, { leftNext: number; rightNext: number }>;
  checkinControl: {
    startAt: number | null;
    limitPerMinute: number | null;
  };
};
```

### MerchProduct

```ts
type MerchProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
  imageData: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};
```

### CheckoutMode

```ts
type CheckoutMode = {
  id: string;
  name: string;
  type: 'standard' | 'discount' | 'fullcut';
  value: number;
  threshold: number | null;
  cutAmount: number | null;
  stackLimit: number | null;
  description: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};
```

### OrderItem

```ts
type OrderItem = {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};
```

### MerchOrder

```ts
type MerchOrder = {
  id: string;
  orderNumber?: string;
  orderType: 'stock' | 'presale';
  status: string;
  voucherCode?: string | null;
  redeemedAt?: number | null;
  redeemedBy?: string | null;
  items: OrderItem[];
  checkoutModeId: string | null;
  checkoutModeName: string;
  discount: number;
  totalBefore: number;
  totalAfter: number;
  handledBy: string;
  paymentMethod: string;
  note: string;
  createdAt: number;
};
```

### Voucher

```ts
type Voucher = {
  code: string;
  status: 'issued' | 'redeemed' | 'voided' | 'refunded' | 'replaced';
  orderId: string;
  orderNumber?: string;
  createdAt: number;
  createdBy?: string;
  redeemedAt: number | null;
  redeemedBy: string | null;
  items: OrderItem[];
  checkoutModeName?: string;
  paymentMethod?: string;
  note?: string;
  totalBefore?: number;
  totalAfter?: number;
  discount?: number;
  history?: any[];
};
```

### TicketDiscountRule

```ts
type TicketDiscountRule = {
  id: string;
  name: string;
  ticketCount: number;
  discountRate: number;
  allowedPrices: number[] | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};
```

### TicketCoupon

```ts
type TicketCoupon = {
  code: string;
  ruleId: string;
  ruleName: string;
  ticketCount: number;
  discountRate: number;
  allowedPrices: number[] | null;
  remaining: number;
  status: 'issued' | 'used' | 'voided';
  issuedAt: number;
  issuedBy: string;
  usedAt: number | null;
  usedBy: string | null;
  usedSeats: any[];
  voidedAt: number | null;
  voidedBy: string | null;
  voidedReason: string | null;
};
```

---

## 认证与账号

### GET `/api/auth/session`

- 权限: 无
- 返回:

```json
{
  "authenticated": true,
  "role": "admin",
  "username": "admin"
}
```

- 作用: 获取当前登录状态

### POST `/api/auth/login`

- 权限: 无
- 请求体:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

- 返回:

```json
{
  "ok": true,
  "role": "admin",
  "username": "admin"
}
```

- 作用: 登录并写入 Session Cookie

### POST `/api/auth/logout`

- 权限: 已登录
- 返回:

```json
{
  "ok": true
}
```

- 作用: 退出登录

### GET `/api/accounts`

- 权限: `admin`
- 返回:

```json
{
  "accounts": [
    {
      "username": "admin",
      "role": "admin",
      "createdAt": 1760000000000,
      "updatedAt": 1760000000000
    }
  ]
}
```

- 作用: 查询账号列表

### POST `/api/accounts`

- 权限: `admin`
- 请求体:

```json
{
  "username": "sales2",
  "password": "123456",
  "role": "sales"
}
```

- 返回:

```json
{
  "ok": true
}
```

- 作用: 创建账号

### PATCH `/api/accounts/:username`

- 权限: `admin`
- 请求体:

```json
{
  "password": "new-password",
  "role": "sales"
}
```

- 返回:

```json
{
  "ok": true
}
```

- 作用: 修改账号角色或密码

### DELETE `/api/accounts/:username`

- 权限: `admin`
- 请求体:

```json
{
  "confirmToken": "uuid"
}
```

- 返回:

```json
{
  "ok": true,
  "undo": {
    "backupFilename": "2026-05-05T10-00-00-000Z-delete-account-sales2.json"
  }
}
```

- 作用: 删除账号

---

## 文创商品

### GET `/api/merch/products`

- 权限: 无
- 返回: `{ products: MerchProduct[] }`
- 作用: 查询商品列表

### POST `/api/merch/products`

- 权限: `admin`
- 请求体:

```json
{
  "name": "钥匙扣",
  "price": 29.9,
  "stock": 100,
  "description": "纪念款",
  "imageData": "data:image/png;base64,...",
  "enabled": true
}
```

- 返回: `{ product: MerchProduct }`
- 作用: 新建商品

### PUT `/api/merch/products/:productId`

- 权限: `admin`
- 请求体: 同新增接口，字段均可选
- 返回: `{ product: MerchProduct }`
- 作用: 更新商品

### DELETE `/api/merch/products/:productId`

- 权限: `admin`
- 请求体: `{ "confirmToken": "uuid" }`
- 返回: `{ ok: true, undo?: { backupFilename: string } }`
- 作用: 删除商品

---

## 文创结账模式

### GET `/api/merch/modes`

- 权限: 无
- 返回: `{ modes: CheckoutMode[] }`
- 作用: 查询结账模式

### POST `/api/merch/modes`

- 权限: `admin`
- 请求体示例 1: 原价

```json
{
  "name": "原价",
  "type": "standard",
  "description": "按标价结算",
  "enabled": true
}
```

- 请求体示例 2: 折扣

```json
{
  "name": "9折",
  "type": "discount",
  "value": 0.9
}
```

- 请求体示例 3: 满减

```json
{
  "name": "满100减20",
  "type": "fullcut",
  "threshold": 100,
  "cutAmount": 20,
  "stackLimit": 1
}
```

- 返回: `{ mode: CheckoutMode }`
- 作用: 创建结账模式

### PUT `/api/merch/modes/:modeId`

- 权限: `admin`
- 请求体: 同新增接口，字段均可选
- 返回: `{ mode: CheckoutMode }`
- 作用: 编辑结账模式

### DELETE `/api/merch/modes/:modeId`

- 权限: `admin`
- 请求体: `{ "confirmToken": "uuid" }`
- 返回: `{ ok: true, undo?: { backupFilename: string } }`
- 作用: 删除结账模式

---

## 文创订单与预购券

### GET `/api/merch/orders`

- 权限: `admin`
- Query:

```ts
{
  since?: number;
  until?: number;
  handler?: string;
  mode?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}
```

- 返回:

```json
{
  "orders": [],
  "total": 0
}
```

- 作用: 分页查询文创订单

### POST `/api/merch/orders`

- 权限: `sales | admin`
- 请求体:

```json
{
  "items": [
    {
      "productId": "product-id",
      "quantity": 2
    }
  ],
  "checkoutModeId": "mode-id",
  "note": "现场售卖",
  "paymentMethod": "现金",
  "orderType": "stock"
}
```

- 预售单额外字段:

```json
{
  "orderType": "presale",
  "voucherCode": "PS260505ABCDEFGH"
}
```

- 返回:
  - 现货单: `{ order: MerchOrder }`
  - 预售单: `{ order: MerchOrder, voucher: Voucher }`
- 作用: 创建现货订单或预售订单

### GET `/api/merch/vouchers/:code`

- 权限: `sales | admin`
- 返回: `{ voucher: Voucher }`
- 作用: 查询预购券详情

### POST `/api/merch/vouchers/:code/redeem`

- 权限: `sales | admin`
- 返回:

```json
{
  "ok": true,
  "voucher": {}
}
```

- 作用: 核销预购券并扣减库存

### POST `/api/merch/vouchers/:code/undo-redeem`

- 权限: `admin`
- 请求体:

```json
{
  "confirm": true,
  "reason": "误操作"
}
```

- 返回: `{ ok: true, voucher: Voucher }`
- 作用: 撤销预购券核销并回补库存

### POST `/api/merch/vouchers/:code/void`

- 权限: `admin`
- 请求体: `{ "confirm": true, "reason": "作废原因" }`
- 返回: `{ ok: true, voucher: Voucher }`
- 作用: 作废预购券

### POST `/api/merch/vouchers/:code/refund`

- 权限: `admin`
- 请求体: `{ "confirm": true, "reason": "退款原因" }`
- 返回: `{ ok: true, voucher: Voucher }`
- 作用: 标记预购券退款

### POST `/api/merch/vouchers/:code/replace`

- 权限: `admin`
- 请求体:

```json
{
  "confirm": true,
  "newCode": "PS260505NEWCODE",
  "reason": "条码损坏"
}
```

- 返回:

```json
{
  "ok": true,
  "voucher": {},
  "oldVoucher": {}
}
```

- 作用: 为预购券换码

### GET `/api/merch/presale/summary`

- 权限: `admin`
- 返回:

```json
{
  "summary": [
    {
      "productId": "id",
      "name": "钥匙扣",
      "unitPrice": 29.9,
      "issuedQty": 10,
      "redeemedQty": 4,
      "outstandingQty": 6
    }
  ]
}
```

- 作用: 预售商品汇总

### POST `/api/merch/orders/manual`

- 权限: `admin`
- 请求体:

```json
{
  "items": [
    {
      "name": "手工录入商品",
      "unitPrice": 20,
      "quantity": 1
    }
  ],
  "checkoutModeId": "mode-id",
  "handledBy": "admin",
  "paymentMethod": "现金",
  "note": "补录",
  "createdAt": 1760000000000
}
```

- 返回: `{ order: MerchOrder }`
- 作用: 手工录入订单

### POST `/api/merch/orders/balance`

- 权限: `admin`
- 请求体:

```json
{
  "total": 100,
  "count": 3,
  "itemName": "平账",
  "handledBy": "admin",
  "paymentMethod": "现金",
  "note": "晚场平账"
}
```

- 返回:

```json
{
  "orders": [],
  "batchId": "uuid"
}
```

- 作用: 将总额拆分成多笔平账订单

### PUT `/api/merch/orders/:orderId`

- 权限: `admin`
- 请求体:

```json
{
  "items": [
    {
      "name": "修改后的商品",
      "unitPrice": 25,
      "quantity": 2
    }
  ],
  "checkoutModeId": "mode-id",
  "handledBy": "admin",
  "paymentMethod": "微信",
  "note": "更新备注",
  "createdAt": 1760000000000
}
```

- 返回: `{ order: MerchOrder }`
- 作用: 更新订单

### DELETE `/api/merch/orders/:orderId`

- 权限: `admin`
- 请求体: `{ "confirmToken": "uuid" }`
- 返回: `{ ok: true, undo?: { backupFilename: string } }`
- 作用: 删除订单

### POST `/api/merch/orders/import`

- 权限: `admin`
- 请求体:

```json
{
  "mode": "replace",
  "orders": [
    {
      "items": [
        {
          "name": "导入商品",
          "unitPrice": 30,
          "quantity": 1
        }
      ],
      "handledBy": "imported"
    }
  ]
}
```

- 返回:

```json
{
  "count": 1
}
```

- 作用: 导入文创订单

### POST `/api/merch/orders/clear`

- 权限: `admin`
- 请求体: `{ "confirmToken": "uuid" }`
- 返回:

```json
{
  "ok": true,
  "cleared": 100,
  "undo": {
    "backupFilename": "..."
  }
}
```

- 作用: 清空订单、预购券及相关核销数据

### GET `/api/merch/orders/export`

- 权限: `admin`
- 返回: `{ orders: MerchOrder[] }`
- 作用: 导出订单 JSON

### GET `/api/merch/orders/export/csv`

- 权限: `admin`
- Query: 同 `GET /api/merch/orders`
- 返回: `text/csv`
- 作用: 导出订单 CSV

### GET `/api/merch/orders/export/pdf`

- 权限: `admin`
- Query:

```ts
{
  ids?: string; // 多个 id 用逗号分隔
}
```

- 返回: `application/pdf`
- 作用: 批量导出订单 PDF

### GET `/api/merch/orders/:orderId/statement.pdf`

- 权限: `admin`
- 返回: `application/pdf`
- 作用: 导出单个订单收据/对账单

---

## 项目与座位

### GET `/api/projects`

- 权限: 无
- 返回:

```json
{
  "projects": [
    {
      "id": "project-id",
      "name": "演出A",
      "rows": 10,
      "cols": 20,
      "createdAt": 1760000000000,
      "updatedAt": 1760000000000,
      "availableSeats": 150
    }
  ]
}
```

- 作用: 查询项目列表

### POST `/api/projects`

- 权限: `admin`
- 请求体:

```json
{
  "name": "演出A",
  "rows": 10,
  "cols": 20,
  "ticketing": {
    "mode": "sequence",
    "sequence": {
      "template": "A-XXXX",
      "startValue": "0001"
    }
  }
}
```

- 返回: `{ project: Project }`
- 作用: 新建项目

### DELETE `/api/projects/:projectId`

- 权限: `admin`
- 请求体: `{ "confirmToken": "uuid" }`
- 返回: `{ ok: true, undo?: { backupFilename: string } }`
- 作用: 删除项目

### GET `/api/projects/:projectId`

- 权限: 无
- 返回: `{ project: Project }`
- 作用: 查询项目详情

### PUT `/api/projects/:projectId`

- 权限: `admin`
- 请求体:

```json
{
  "name": "演出A-更新",
  "bulk": true,
  "seats": [
    {
      "row": 0,
      "col": 0,
      "status": "available",
      "price": 299,
      "ticketNumber": "A-0001"
    }
  ]
}
```

- 返回:

```json
{
  "project": {},
  "undo": {
    "backupFilename": "..."
  }
}
```

- 作用: 修改项目名称或批量更新座位

### PATCH `/api/projects/:projectId/seats/:seatId`

- 权限: `admin`
- 请求体:

```json
{
  "status": "sold",
  "price": 299,
  "ticketNumber": "A-0001",
  "checkinStatus": "checked"
}
```

- 返回:

```json
{
  "ok": true,
  "seat": {}
}
```

- 作用: 单座位更新

### POST `/api/projects/:projectId/import`

- 权限: `admin`
- 请求体:

```json
{
  "confirmToken": "uuid",
  "project": {
    "name": "演出A",
    "rows": 10,
    "cols": 20,
    "seats": {
      "r0-c0": {
        "row": 0,
        "col": 0,
        "status": "sold",
        "price": 299,
        "ticketNumber": "A-0001",
        "seatLabel": "1排1号",
        "checkedInAt": null,
        "checkedInBy": null
      }
    }
  }
}
```

- 返回: `{ project: Project, undo?: { backupFilename: string } }`
- 作用: 导入项目座位状态

### GET `/api/projects/:projectId/export`

- 权限: `admin`
- 返回: `{ project: Project }`
- 作用: 导出项目 JSON

### GET `/api/projects/:projectId/export/json`

- 权限: `admin`
- Query:

```ts
{
  scope?: 'seats';
}
```

- 返回: `application/json`
- 作用: 导出完整项目数据或仅导出座位数据

### GET `/api/projects/:projectId/export/csv`

- 权限: `admin`
- 返回: `text/csv`
- 作用: 导出座位表 CSV

### GET `/api/projects/:projectId/export/png`

- 权限: `admin`
- 返回: `image/png`
- 作用: 导出座位图 PNG

---

## 票号、优惠规则、优惠券

### POST `/api/projects/:projectId/ticketing`

- 权限: `admin`
- 请求体:

```json
{
  "confirmToken": "uuid",
  "mode": "sequence",
  "sequence": {
    "template": "VIP-XXXX",
    "startValue": "0001"
  }
}
```

- 返回: `{ project: Project, undo?: { backupFilename: string } }`
- 作用: 更新票号生成配置

### POST `/api/projects/:projectId/ticketing/regenerate`

- 权限: `admin`
- 请求体: `{ "confirmToken": "uuid" }`
- 返回: `{ project: Project, undo?: { backupFilename: string } }`
- 作用: 按当前规则重算全部票号

### GET `/api/projects/:projectId/ticket-discounts`

- 权限: `admin`
- 返回: `{ rules: TicketDiscountRule[] }`
- 作用: 查询票务折扣规则

### POST `/api/projects/:projectId/ticket-discounts`

- 权限: `admin`
- 请求体:

```json
{
  "name": "买3张9折",
  "ticketCount": 3,
  "discountRate": 9,
  "allowedPrices": [299, 399],
  "enabled": true
}
```

- 返回: `{ rule: TicketDiscountRule }`
- 作用: 新增或更新折扣规则

### DELETE `/api/projects/:projectId/ticket-discounts/:ruleId`

- 权限: `admin`
- 返回: `{ ok: true }`
- 作用: 删除折扣规则

### GET `/api/projects/:projectId/ticket-coupons/:code`

- 权限: `sales | admin`
- 返回:

```json
{
  "coupon": {},
  "rule": {}
}
```

- 作用: 查询单张优惠券

### GET `/api/projects/:projectId/ticket-coupons`

- 权限: `admin`
- Query:

```ts
{
  q?: string;
  status?: string;
}
```

- 返回: `{ coupons: TicketCoupon[] }`
- 作用: 查询优惠券列表

### POST `/api/projects/:projectId/ticket-coupons/issue`

- 权限: `admin`
- 请求体:

```json
{
  "ruleId": "rule-id",
  "quantity": 10,
  "codes": ["CP260505AAAAAA"]
}
```

- 返回: `{ coupons: TicketCoupon[] }`
- 作用: 批量签发优惠券

### POST `/api/projects/:projectId/ticket-coupons/:code/void`

- 权限: `admin`
- 请求体:

```json
{
  "confirm": true,
  "reason": "活动取消"
}
```

- 返回: `{ ok: true, coupon: TicketCoupon }`
- 作用: 作废优惠券

### POST `/api/projects/:projectId/ticket-coupons/:code/redeem`

- 权限: `sales | admin`
- 请求体:

```json
{
  "count": 1
}
```

- 返回: `{ ok: true, coupon: TicketCoupon }`
- 作用: 手工核销优惠券次数

---

## 检票与检票控制

### PATCH `/api/projects/:projectId/checkin-control`

- 权限: `admin`
- 请求体:

```json
{
  "startAt": 1760000000000,
  "limitPerMinute": 120
}
```

- 返回:

```json
{
  "ok": true,
  "checkinControl": {
    "startAt": 1760000000000,
    "limitPerMinute": 120
  }
}
```

- 作用: 配置检票起始时间和每分钟上限

### GET `/api/projects/:projectId/checkin/stats`

- 权限: 无
- 返回:

```json
{
  "stats": {
    "totalSold": 500,
    "checkedIn": 120
  }
}
```

- 作用: 查看项目检票统计

### POST `/api/projects/:projectId/checkin`

- 权限: `sales | admin`
- 请求体:

```json
{
  "ticketCode": "VIP-0001",
  "scannerId": "gate-a"
}
```

- 返回:

```json
{
  "ok": true,
  "seat": {
    "projectId": "project-id",
    "projectName": "演出A",
    "seatId": "r0-c0",
    "row": 0,
    "col": 0,
    "seatLabel": "1排1号",
    "ticketNumber": "VIP-0001",
    "price": 299,
    "status": "sold",
    "issuedAt": 1760000000000,
    "checkedInAt": 1760000100000,
    "checkedInBy": "sales"
  },
  "stats": {
    "totalSold": 500,
    "checkedIn": 121
  }
}
```

- 作用: 单票检票

### POST `/api/projects/:projectId/checkin/batch`

- 权限: `sales | admin`
- 请求体:

```json
{
  "ticketCodes": ["VIP-0001", "VIP-0002"],
  "scannerId": "gate-a"
}
```

- 返回:

```json
{
  "results": [
    {
      "ticketCode": "VIP-0001",
      "ok": true,
      "seat": {}
    },
    {
      "ticketCode": "VIP-0002",
      "ok": false,
      "error": "已检票"
    }
  ]
}
```

- 作用: 批量检票

### POST `/api/checkins/seat`

- 权限: `admin`
- 请求体:

```json
{
  "ticketNumber": "VIP-0001",
  "action": "clear",
  "confirmToken": "uuid"
}
```

- `action` 含义:
  - `clear`: 清除已检票状态
  - 其他值或不传: 标记为已检票

- 返回:

```json
{
  "ok": true,
  "seat": {},
  "undo": {
    "backupFilename": "..."
  }
}
```

- 作用: 管理端手工修改检票状态

### GET `/api/checkins`

- 权限: `admin`
- Query:

```ts
{
  projectId?: string;
  limit?: number;
}
```

- 返回: `{ logs: any[] }`
- 作用: 查询检票日志

---

## 审计、备份、状态、监控

### GET `/api/audit`

- 权限: `admin`
- Query:

```ts
{
  action?: string;
  limit?: number;
  offset?: number;
}
```

- 返回: `{ logs: any[] }`
- 作用: 查询审计日志

### GET `/api/audit/export`

- 权限: `admin`
- Query:

```ts
{
  action?: string;
  limit?: number;
}
```

- 返回: `application/json`
- 作用: 导出审计日志

### GET `/api/backups`

- 权限: `admin`
- 返回:

```json
{
  "backups": [
    {
      "name": "2026-05-05T10-00-00-000Z-auto.json",
      "mtime": 1760000000000
    }
  ]
}
```

- 作用: 查询备份文件列表

### POST `/api/backups/restore`

- 权限: `admin`
- 请求体:

```json
{
  "filename": "2026-05-05T10-00-00-000Z-auto.json",
  "confirmToken": "uuid"
}
```

- 返回: `{ ok: true, undo?: { backupFilename: string } }`
- 作用: 恢复备份

### GET `/api/backups/:filename`

- 权限: `admin`
- 返回: 文件下载
- 作用: 下载备份文件

### GET `/api/state/export`

- 权限: `admin`
- 返回: `state.json` 文件下载
- 作用: 导出当前系统状态

### GET `/api/metrics`

- 权限: `admin`
- 返回:

```json
{
  "timestamp": 1760000000000,
  "uptimeSeconds": 1000,
  "systemUptimeSeconds": 99999,
  "loadavg": [0.1, 0.2, 0.3],
  "memory": {
    "rss": 0,
    "heapTotal": 0,
    "heapUsed": 0,
    "external": 0,
    "arrayBuffers": 0,
    "totalMem": 0,
    "freeMem": 0,
    "usedPercent": 12.3
  },
  "cpuUsage": {
    "user": 0,
    "system": 0
  },
  "process": {
    "pid": 12345,
    "nodeVersion": "v22.0.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "counters": {
    "accounts": 2,
    "projects": 1,
    "merchProducts": 10,
    "merchOrders": 100,
    "auditLogs": 50,
    "checkinLogs": 20,
    "sockets": 3
  }
}
```

- 作用: 查看系统运行指标

### GET `/logs`

- 权限: `admin`
- Query:

```ts
{
  limit?: number;
}
```

- 返回:

```json
{
  "audit": [
    {
      "createdAt": 1760000000000,
      "action": "project:delete",
      "actor": "admin",
      "detail": "删除项目 project-id"
    }
  ]
}
```

- 作用: 简化版审计日志查看

### GET `/healthz`

- 权限: 无
- 返回:

```json
{
  "ok": true,
  "uptime": 1234.56
}
```

- 作用: 健康检查

---

## Socket.IO 实时接口

实时事件定义在 [main.js](/Users/wenzhengliu/Documents/Gewuqingchun/main.js:5228)。

### 服务端推送事件

#### `project:update`

- 推送数据:

```json
{
  "projectId": "project-id",
  "project": {}
}
```

- 作用: 项目座位变化时推送最新项目数据

#### `admin:accounts:update`

- 推送数据:

```json
{
  "accounts": []
}
```

- 作用: 管理员账号变化时实时同步

### 客户端调用事件

#### `project:join`

- 入参:

```json
{
  "projectId": "project-id"
}
```

- ack:

```json
{
  "ok": true,
  "project": {}
}
```

- 作用: 加入某个项目的实时房间

#### `lock-seat`

- 入参:

```json
{
  "projectId": "project-id",
  "seatId": "r0-c0"
}
```

- ack:

```json
{
  "ok": true,
  "lockedBy": {
    "socketId": "socket-id",
    "username": "sales",
    "role": "sales"
  },
  "lockExpiresAt": 1760000000000,
  "serverTime": 1760000000000
}
```

- 作用: 锁定座位，防止多人同时售卖

#### `unlock-seat`

- 入参:

```json
{
  "projectId": "project-id",
  "seatId": "r0-c0"
}
```

- ack: `{ ok: true }`
- 作用: 释放座位锁

#### `tickets:checkout`

- 入参:

```json
{
  "projectId": "project-id",
  "seatIds": ["r0-c0", "r0-c1"],
  "paymentMethod": "现金",
  "useCoupon": true,
  "couponCode": "CP260505AAAAAA"
}
```

- ack:

```json
{
  "ok": true,
  "order": {
    "id": "uuid",
    "orderNo": "TK26050500001",
    "status": "pending",
    "paymentMethod": "现金",
    "seatCount": 2,
    "totalOriginal": 598,
    "discount": 59.8,
    "total": 538.2,
    "seatQueue": ["r0-c0", "r0-c1"]
  },
  "coupon": {
    "code": "CP260505AAAAAA",
    "remaining": 1,
    "status": "issued",
    "discountRate": 9,
    "allowedPrices": [299],
    "appliedCount": 1
  }
}
```

- 作用: 发起票务结账，进入待签发状态

#### `seat:issue`

- 入参:

```json
{
  "projectId": "project-id",
  "seatId": "r0-c0",
  "ticketCode": "VIP-0001",
  "couponCode": "CP260505AAAAAA",
  "orderId": "uuid"
}
```

- ack:

```json
{
  "ok": true,
  "seat": {},
  "order": {
    "id": "uuid",
    "orderNo": "TK26050500001",
    "status": "completed",
    "issuedCount": 2,
    "seatCount": 2
  }
}
```

- 作用: 实际签发座位门票

#### `request-ticket-code`

- 入参:

```json
{
  "projectId": "project-id",
  "seatId": "r0-c0"
}
```

- ack:

```json
{
  "ok": true,
  "ticketCode": "VIP-0001",
  "qrDataUrl": "data:image/png;base64,..."
}
```

- 作用: 获取票码和二维码

---

## 页面路由

这几个不是 API，但前端页面入口也在服务端里定义了:

- `GET /admin.html`
  - 管理后台页面
- `GET /sales.html`
  - 售票页面
- `GET /favicon.ico`
  - 空响应，避免 404 噪音

