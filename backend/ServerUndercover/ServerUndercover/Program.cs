using Firebase.Auth;
using Firebase.Auth.Providers;
using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using ServerUndercover.Controllers;

Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "game-undercover-d70dd-firebase-adminsdk-fbsvc-a08a981514.json");

var builder = WebApplication.CreateBuilder(args);

// 1. Đăng ký Controller
builder.Services.AddControllers();

// 2. BẬT LẠI SWAGGER (Rất quan trọng để biết Port)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 3. Cấu hình CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowNextJs", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Đăng ký Service vào DI Container
builder.Services.AddScoped<IUserService, UserService>();

// --- PHẦN FIRESTORE (Cần thêm vào) ---
// Thay "your-project-id" bằng ID thật của bạn (ví dụ: game-undercover-d70dd)
string projectId = "game-undercover-d70dd";
FirestoreDb firestoreDb = FirestoreDb.Create(projectId);
builder.Services.AddSingleton(firestoreDb);


// 4. Cấu hình Firebase
var config = new FirebaseAuthConfig
{
    ApiKey = "AIzaSyDjYibTklIP4LZHn5JleaQsY6ut5qzSfJs",
    AuthDomain = "game-undercover-d70dd.firebaseapp.com",
    Providers = new FirebaseAuthProvider[] { new EmailProvider() }
};

var authClient = new FirebaseAuthClient(config);
// Ép kiểu rõ ràng cho Dependency Injection để AuthController nhận diện được
builder.Services.AddSingleton<FirebaseAuthClient>(authClient);

var app = builder.Build();

// ============ KHU VỰC CẤU HÌNH PIPELINE ============

// Kích hoạt giao diện Swagger
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("AllowNextJs");
app.MapControllers();

app.Run();