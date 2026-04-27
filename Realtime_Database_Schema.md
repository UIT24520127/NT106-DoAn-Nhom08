# BẢNG THIẾT KẾ DATABASE REALTIME - GAME UNDERCOVER

Tài liệu này mô tả kiến trúc cơ sở dữ liệu (JSON) dùng để đồng bộ thời gian thực cho ván game. Dữ liệu được chia thành 5 nhóm chính để dễ quản lý, tăng tốc độ đọc/ghi dữ liệu và bảo mật thông tin tuyệt đối.

---

## 1. Cơ chế Quản lý Phòng & Trạng thái Online (Room Presence)
**Mục đích:** Biết được ai đang ở trong phòng chờ, ai đã sẵn sàng và ai bị rớt mạng.

```json
room_presence/{room_id}
├── status: "waiting" / "in_game"       // Đang chờ hay đã vào game
├── host_uid: "user_123"                // ID của chủ phòng
└── players
    ├── {uid_1}
    │   ├── online: true                // Đèn xanh online
    │   ├── is_ready: true              // Đã bấm sẵn sàng
    │   └── last_seen: 1684301234       // Thời gian gửi tín hiệu cuối (để check lag)
    └── {uid_...}
```

---

## 2. Máy chủ Trạng thái Ván đấu (Game State)
**Mục đích:** Là "nhạc trưởng" điều phối tiến độ game. Mọi người chơi đều nhìn vào đây để biết hiện tại làm gì, tới lượt ai nói và khi nào hết giờ.

```json
game_state/{game_id}
├── status: "playing" / "ended"                     
├── phase: "describe" / "voting" / "mr_white_guess" // Giai đoạn hiện tại: Mô tả / Vote / Mũ trắng đoán
├── current_round: 2                                // Vòng chơi thứ mấy
├── current_turn_uid: "uid_2"                       // Ai đang cầm mic nói (chỉ có lúc phase = describe)
└── turn_deadline: 1684305000                       // Hiển thị thanh đếm ngược thời gian
```

---

## 3. Trạng thái Thẻ người chơi (Player State)
**Lưu ý quan trọng:** Để chống lộ file và hack/soi từ khóa, phần này BẮT BUỘC rạch ròi thành 2 nhánh: Public (ai cũng thấy) và Secret (Bí mật).

### A. Nhánh Public (Hiện trên màn hình mọi người)
**Mục đích:** Để biết game thủ đang sống hay chết, đã vote xong chưa.

```json
game_players_public/{game_id}
├── {uid_1}
│   ├── is_alive: true          // SỐNG: Được chat, được vote
│   ├── has_voted: false        // Cờ xác nhận đã ấn vote hay chưa
│   └── order: 1                // Vị trí ngồi (Thứ tự nói vòng tròn)
└── {uid_2}
    ├── is_alive: false         // CHẾT: Đổi màu đen trắng, tước quyền bỏ phiếu
    ├── death_round: 1          // Chết ở vòng nào
    └── death_reason: "voted"   // Bị dân làng nhét vào lồng heo gài vote chết
```

### B. Nhánh Secret (Cực kỳ Bí mật)
**Mục đích:** Giấu lá bài và từ vựng. Hệ thống bảo mật (Rules) sẽ khóa nhánh này, **máy của ai thì chỉ tải đúng File của người đó về**. Giữ tuyệt đối bí mật khỏi người chơi khác.

```json
game_players_secret/{game_id}
├── {uid_1}
│   ├── role: "civilian"            // Dân
│   └── keyword: "Bác Sĩ"           // Từ của Dân
└── {uid_2}
    ├── role: "mr_white"            // Mũ Trắng
    └── keyword: null               // Mũ trắng mù từ
```

---

## 4. Hệ thống Kênh Chat (In-Game Chat)
**Mục đích:** Phân loại chat cho người chơi còn sống đấu tố nhau, và kênh ẩn danh cho người chơi đã loại "đàm đạo". 

```json
chats/{room_id}
├── typing
│   └── {uid_1}: true                   // Bọt thoại [...] đang gõ phím
│
├── public_messages                     // KHU CHUNG: Dành cho mọi người
│   └── {msg_id}: { "uid": "u_1", "text": "Thằng số 2 gian xảo", "timestamp": 12345 }
│
└── ghost_messages                      // ÂM PHỦ: Người ẤY (is_alive = false) mới đọc + gõ được
    └── {msg_id}: { "uid": "u_2", "text": "Cay thế, tui là dân mà", "timestamp": 12347 }
```

---

## 5. Hòm phiếu Bầu chọn (Voting & Events)
**Mục đích:** Đảm bảo hệ thống bỏ phiếu chạy độc lập theo từng vòng (không đè dữ liệu lên nhau) và lưu vết đặc biệt cho Mũ Trắng đoán từ khóa.

```json
game_votes/{game_id}/round_{current_round}
├── submitted_votes 
│   ├── {uid_1}: "uid_2"                // uid_1 gửi phiếu chém uid_2 (Chỉ lưu vào RAM Server/DB k hiện ngay)
│   └── {uid_3}: "uid_2"                
└── tally_results                       // BIỂU ĐỒ KẾT QUẢ: (Xuất hiện lúc hết giờ để bay màu)
    ├── "uid_2": 2                      // Bị 2 phiếu vote chết -> Gọi lệnh set u2_is_alive = false
    └── "uid_1": 0

// Khởi chạy khi nhân vật bị vote chết là Mũ Trắng
mr_white_guessing/{game_id}
├── guessing_uid: "uid_2"               
├── submitted_word: "Y Tá"              // Từ ông mũ trắng đánh vào
└── is_correct: false                   
```
